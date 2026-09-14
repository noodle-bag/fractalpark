'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export type ExplorePanelPosition = 0 | 1 | 2;
interface PanelEntry {
  owner: string;
  pathname: string;
  position: ExplorePanelPosition;
  modal: boolean;
  depth: number;
}
const entryKey = 'fractalParkPanel';
const openModal = () => document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');

/** UI Back entries never restore an older artwork URL or router snapshot. */
export function useExplorePanelNavigation(enabled: boolean, onPositionChange: (position: ExplorePanelPosition) => void, getProjectedArtworkHref?: () => string | null) {
  const pathname = usePathname();
  const search = useSearchParams();
  const urlSignal = `${pathname ?? ''}?${search?.toString() ?? ''}`;
  const owner = useRef<string | null>(null);
  const current = useRef<PanelEntry | null>(null);
  const latestRoute = useRef<{ url: string; state: Record<string, unknown> } | null>(null);
  const change = useRef(onPositionChange);
  const projectedHref = useRef(getProjectedArtworkHref);
  useEffect(() => { change.current = onPositionChange; }, [onPositionChange]);
  useEffect(() => { projectedHref.current = getProjectedArtworkHref; }, [getProjectedArtworkHref]);

  useEffect(() => {
    if (!enabled) return;
    const token = crypto.randomUUID();
    const previous = history.state?.[entryKey] as PanelEntry | undefined;
    const path = location.pathname;
    const baseDepth = previous?.pathname === path && Number.isInteger(previous.depth) ? previous.depth : 0;
    owner.current = token;
    let modalBackPending = false;
    const write = (position: ExplorePanelPosition, modal: boolean, push = false) => {
      const entry: PanelEntry = { owner: token, pathname: path, position, modal, depth: baseDepth + position + Number(modal) };
      current.current = entry;
      history[push ? 'pushState' : 'replaceState']({ ...history.state, [entryKey]: entry }, '', location.href);
      latestRoute.current = { url: latestRoute.current?.url ?? location.href, state: { ...history.state } };
    };
    write(0, false);
    change.current(0);
    // Existing Radix portals retain their own dismissal and focus owners.
    const observeModal = () => {
      const entry = current.current;
      if (!entry || location.pathname !== path) return;
      const modal = !!openModal();
      if (history.state?.[entryKey]?.owner !== token) {
        // Next can replace custom metadata when committing an artwork query.
        // Capture that committed address before restoring our UI marker.
        latestRoute.current = { url: location.href, state: { ...history.state } };
        history.replaceState({ ...history.state, [entryKey]: entry }, '', location.href);
      }
      if (modal && !entry.modal) write(entry.position, true, true);
      else if (!modal && entry.modal && !modalBackPending) {
        modalBackPending = true;
        history.back();
      }
    };
    const observer = new MutationObserver(observeModal);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] });
    const onBack = (event: PopStateEvent) => {
      const entry = event.state?.[entryKey] as PanelEntry | undefined;
      if (!entry || entry.pathname !== path) return;
      if (entry.owner !== token) {
        // A revisit must not expose obsolete UI entries from the previous mount.
        if (Number.isInteger(entry.depth) && entry.depth >= 0) {
          event.stopImmediatePropagation();
          history.go(-entry.depth - 1);
        }
        return;
      }
      event.stopImmediatePropagation();
      const dismissedModalBack = modalBackPending;
      modalBackPending = false;
      const route = latestRoute.current;
      if (route) {
        // Let Next's public history bridge restore the current URL too. Copying
        // its internal marker would bypass that bridge, leaving router state
        // attached to the old native entry after a UI-only traversal.
        const state: Record<string, unknown> = { ...route.state, [entryKey]: entry };
        delete state.__NA;
        delete state._N;
        history.replaceState(state, '', projectedHref.current?.() ?? route.url);
      }
      current.current = entry;
      if (!entry.modal && openModal() && !dismissedModalBack) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      change.current(entry.position);
      // A new dialog may open before a dismissed dialog's traversal completes.
      // Register that layer without dismissing it on the earlier dialog's Back.
      if (dismissedModalBack) observeModal();
    };
    window.addEventListener('popstate', onBack, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('popstate', onBack, true);
      owner.current = null;
      current.current = null;
      if (history.state?.[entryKey]?.owner === token) {
        const state = { ...history.state };
        delete state[entryKey];
        history.replaceState(state, '', location.href);
      }
    };
  }, [enabled]);

  // The existing debounced artwork URL writer belongs to Explore. Next can
  // replace history metadata on those updates; preserve just the current UI
  // entry afterwards, without adding entries or changing the artwork URL.
  useEffect(() => {
    const entry = current.current;
    if (!enabled || !entry || pathname !== entry.pathname) return;
    // Read the router's committed search projection, not the transient native
    // history URL while a panel Back traversal is in flight.
    const url = projectedHref.current?.() ?? (urlSignal.startsWith('?') ? location.href : new URL(urlSignal, location.origin).href);
    history.replaceState({ ...history.state, [entryKey]: current.current }, '', url);
    latestRoute.current = { url, state: { ...history.state } };
  }, [enabled, pathname, urlSignal]);

  return useCallback((next: ExplorePanelPosition) => {
    const entry = current.current;
    if (!entry || !owner.current) { change.current(next); return; }
    if (entry.modal || next === entry.position) return;
    history.replaceState({ ...history.state, [entryKey]: entry }, '', location.href);
    if (next < entry.position) { history.go(next - entry.position); return; }
    const baseDepth = entry.depth - entry.position;
    for (let position = entry.position + 1; position <= next; position++) {
      const updated = { ...entry, position: position as ExplorePanelPosition, depth: baseDepth + position };
      current.current = updated;
      history.pushState({ ...history.state, [entryKey]: updated }, '', location.href);
    }
    latestRoute.current = { url: latestRoute.current?.url ?? location.href, state: { ...history.state } };
    change.current(next);
  }, []);
}
