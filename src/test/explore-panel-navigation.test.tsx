import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useExplorePanelNavigation } from '@/hooks/useExplorePanelNavigation';

const route = vi.hoisted(() => ({ pathname: '/en/explore', search: 'value=initial' }));
vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
}));
afterEach(() => {
  cleanup();
  route.pathname = '/en/explore';
  route.search = 'value=initial';
  history.replaceState(null, '', '/');
});

it('preserves the committed artwork query when Back targets a pre-edit panel entry', () => {
  history.replaceState({ __NA: true, retained: 'router' }, '', '/en/explore?value=initial');
  const change = vi.fn();
  const { result, rerender } = renderHook(() => useExplorePanelNavigation(true, change));
  act(() => result.current(1));
  const half = history.state;
  act(() => result.current(2));
  route.search = 'value=edited';
  // The native URL can still reflect an older entry while React publishes
  // the committed router query. Never use that transient URL as artwork state.
  history.replaceState({ __NA: true, retained: 'router' }, '', '/en/explore?value=initial');
  rerender();
  act(() => {
    history.replaceState(half, '', '/en/explore?value=initial');
    window.dispatchEvent(new PopStateEvent('popstate', { state: half }));
  });
  expect(change).toHaveBeenLastCalledWith(1);
  expect(location.search).toBe('?value=edited');
  expect(history.state.retained).toBe('router');
  expect(history.state.fractalParkPanel.position).toBe(1);
});

it('leaves actual page traversal with the existing router', () => {
  history.replaceState({ __NA: true }, '', '/en/explore?value=initial');
  renderHook(() => useExplorePanelNavigation(true, vi.fn()));
  const router = vi.fn();
  window.addEventListener('popstate', router);
  act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: { __NA: true } })));
  expect(router).toHaveBeenCalledOnce();
  window.removeEventListener('popstate', router);
});

it('captures a router URL commit that replaces the custom UI metadata', async () => {
  history.replaceState({ __NA: true }, '', '/en/explore?value=initial');
  const change = vi.fn();
  const { result } = renderHook(() => useExplorePanelNavigation(true, change));
  act(() => result.current(1));
  const half = history.state;
  act(() => result.current(2));
  history.replaceState({ __NA: true }, '', '/en/explore?value=edited');
  const committedContent = document.createElement('div');
  document.body.appendChild(committedContent);
  await waitFor(() => expect(history.state.fractalParkPanel?.position).toBe(2));
  act(() => {
    history.replaceState(half, '', '/en/explore?value=initial');
    window.dispatchEvent(new PopStateEvent('popstate', { state: half }));
  });
  expect(location.search).toBe('?value=edited');
  expect(change).toHaveBeenLastCalledWith(1);
  committedContent.remove();
});

it('uses the qualified URL writer output rather than stale router/history snapshots', () => {
  history.replaceState({ __NA: true }, '', '/en/explore?value=initial');
  let appliedHref: string | null = null;
  const { result } = renderHook(() => useExplorePanelNavigation(true, vi.fn(), () => appliedHref));
  act(() => result.current(1));
  const half = history.state;
  act(() => result.current(2));
  appliedHref = '/en/explore?value=edited&draft=retained';
  act(() => {
    history.replaceState(half, '', '/en/explore?value=initial');
    window.dispatchEvent(new PopStateEvent('popstate', { state: half }));
  });
  expect(location.search).toBe('?value=edited&draft=retained');
  expect(history.state.fractalParkPanel.position).toBe(1);
});

it('requests only one Back while a dismissed modal traversal is pending', async () => {
  history.replaceState({ __NA: true }, '', '/en/explore?value=initial');
  const back = vi.spyOn(history, 'back').mockImplementation(() => {});
  const { unmount } = renderHook(() => useExplorePanelNavigation(true, vi.fn()));
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('data-state', 'open');
  const mutation = document.createElement('div');
  try {
    document.body.appendChild(dialog);
    await waitFor(() => expect(history.state.fractalParkPanel.modal).toBe(true));
    dialog.remove();
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
    await act(async () => { document.body.appendChild(mutation); });
    expect(back).toHaveBeenCalledTimes(1);
  } finally {
    unmount();
    dialog.remove();
    mutation.remove();
    back.mockRestore();
  }
});

it('keeps a replacement dialog open when the earlier dismissed dialog finishes Back', async () => {
  history.replaceState({ __NA: true }, '', '/en/explore?value=initial');
  const back = vi.spyOn(history, 'back').mockImplementation(() => {});
  const keydown = vi.fn();
  document.addEventListener('keydown', keydown);
  const { result, unmount } = renderHook(() => useExplorePanelNavigation(true, vi.fn()));
  act(() => result.current(1));
  const half = history.state;
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('data-state', 'open');
  try {
    document.body.appendChild(dialog);
    await waitFor(() => expect(history.state.fractalParkPanel.modal).toBe(true));
    dialog.remove();
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
    await act(async () => { document.body.appendChild(dialog); });
    act(() => {
      history.replaceState(half, '', location.href);
      window.dispatchEvent(new PopStateEvent('popstate', { state: half }));
    });
    expect(keydown).not.toHaveBeenCalled();
    expect(history.state.fractalParkPanel.modal).toBe(true);
    dialog.remove();
    await waitFor(() => expect(back).toHaveBeenCalledTimes(2));
  } finally {
    unmount();
    dialog.remove();
    document.removeEventListener('keydown', keydown);
    back.mockRestore();
  }
});

it('does not project an Explore artwork URL over a committed destination route', () => {
  history.replaceState({ __NA: true }, '', '/en/explore?value=initial');
  const { rerender } = renderHook(() => useExplorePanelNavigation(true, vi.fn(), () => '/en/explore?value=edited'));
  history.replaceState({ __NA: true, destination: 'gallery' }, '', '/en/gallery?view=mine');
  route.pathname = '/en/gallery';
  route.search = 'view=mine';
  rerender();
  expect(location.pathname).toBe('/en/gallery');
  expect(location.search).toBe('?view=mine');
  expect(history.state.destination).toBe('gallery');
  expect(history.state.fractalParkPanel).toBeUndefined();
});
