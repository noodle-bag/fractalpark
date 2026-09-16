'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { useExplorePanelNavigation } from '@/hooks/useExplorePanelNavigation';

interface ExploreInspectorProps {
  children: ReactNode;
  summary?: ReactNode;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onToolbarMount: (element: HTMLDivElement | null) => void;
  getProjectedArtworkHref?: () => string | null;
}

/** Retain controls and toolbar while the parent owns the shared workspace geometry. */
export function ExploreInspector({ children, summary, collapsed, onCollapsedChange, onToolbarMount, getProjectedArtworkHref }: ExploreInspectorProps) {
  const t = useTranslations('explore.controls');
  const ta = useTranslations('explore.artworkActions');
  const [desktop, setDesktop] = useState<boolean | null>(null);
  const [artworkOpen, setArtworkOpen] = useState(false);
  const [, setHistoryPosition] = useState<0 | 1 | 2>(0);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Keep the existing dialog-first Back and latest-URL bridge. Mobile layout
  // no longer creates history entries for visual panel positions.
  useExplorePanelNavigation(desktop !== null, setHistoryPosition, getProjectedArtworkHref);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const actionsExpanded = desktop === true || artworkOpen;

  return (
    <aside
      className="explore-inspector pointer-events-none z-20 flex min-h-0 w-full"
      data-testid="explore-inspector"
      data-collapsed={collapsed}
      data-layout={desktop === true ? 'desktop' : 'mobile'}
    >
      <button
        ref={toggleRef}
        type="button"
        className={`explore-inspector-toggle pointer-events-auto absolute inset-y-0 z-10 w-3 items-center justify-center border-x bg-muted text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring ${collapsed ? 'right-0' : 'left-0'}`}
        aria-label={collapsed ? t('show') : t('hide')}
        aria-expanded={!collapsed}
        aria-controls="explore-inspector-body"
        onClick={() => onCollapsedChange(!collapsed)}
      >
        {collapsed ? <ChevronLeft className="size-3" /> : <ChevronRight className="size-3" />}
      </button>
      <div
        id="explore-inspector-body"
        inert={collapsed}
        className={`explore-inspector-body pointer-events-auto flex min-h-0 w-full flex-col border-t bg-background/95 backdrop-blur ${collapsed ? 'invisible' : ''}`}
        onKeyDown={event => {
          if (event.key !== 'Escape' || event.defaultPrevented || desktop !== true) return;
          onCollapsedChange(true);
          toggleRef.current?.focus();
        }}
      >
        <div className="explore-inspector-content flex min-h-0 flex-1 flex-col gap-2 px-4 py-3" data-testid="explore-inspector-content">
          <div className="order-1 shrink-0">{summary}</div>
          <div className="explore-artwork-region order-2 shrink-0 lg:order-3">
            <details
              className="explore-artwork-disclosure rounded-control border lg:rounded-none lg:border-0"
              open={actionsExpanded}
              onToggle={event => {
                if (desktop === false) setArtworkOpen(event.currentTarget.open);
              }}
            >
              <summary className="flex h-9 cursor-pointer list-none items-center justify-between px-3 text-control font-medium focus-visible:outline-2 focus-visible:outline-ring lg:hidden">
                <span>{ta('toolbar')}</span>
                {artworkOpen ? <ChevronUp aria-hidden className="size-4" /> : <ChevronDown aria-hidden className="size-4" />}
              </summary>
              <div ref={onToolbarMount} className="explore-artwork-bar border-t px-2 py-2 lg:-mx-4 lg:-mb-3 lg:border-t lg:px-4" data-testid="explore-artwork-bar" />
            </details>
          </div>
          <div id="explore-inspector-controls" className="explore-inspector-controls order-3 flex min-h-0 flex-col lg:order-2 lg:flex-1">
            {children}
          </div>
        </div>
      </div>
    </aside>
  );
}
