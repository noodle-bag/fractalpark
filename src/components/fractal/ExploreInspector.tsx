'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { useExplorePanelNavigation, type ExplorePanelPosition } from '@/hooks/useExplorePanelNavigation';

interface ExploreInspectorProps {
  children: ReactNode;
  summary?: ReactNode;
  onToolbarMount: (element: HTMLDivElement | null) => void;
  getProjectedArtworkHref?: () => string | null;
}

/** Retain controls and toolbar independently of the fixed canvas. */
export function ExploreInspector({ children, summary, onToolbarMount, getProjectedArtworkHref }: ExploreInspectorProps) {
  const t = useTranslations('explore.controls');
  const [collapsed, setCollapsed] = useState(false);
  const [desktop, setDesktop] = useState<boolean | null>(null);
  const [position, setPosition] = useState<ExplorePanelPosition>(0);
  const [viewport, setViewport] = useState({ height: 0, bottom: 0 });
  const [keyboard, setKeyboard] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; y: number } | null>(null);
  const dragged = useRef(false);
  const navigate = useExplorePanelNavigation(desktop !== null, setPosition, getProjectedArtworkHref);

  useEffect(() => {
    if (desktop && position > 0) navigate(0);
  }, [desktop, position, navigate]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px), (min-width: 640px) and (max-height: 480px)');
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const visual = window.visualViewport;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const height = visual?.height ?? window.innerHeight;
        setViewport({ height, bottom: Math.max(0, window.innerHeight - height - (visual?.offsetTop ?? 0)) });
        setKeyboard(height < window.innerHeight * 0.8);
        const focused = document.activeElement;
        if (desktop === false && bodyRef.current?.contains(focused) && focused?.matches('input:not([type="range"]):not([type="checkbox"]), textarea, [contenteditable="true"]')) {
          navigate(2);
          requestAnimationFrame(() => focused.scrollIntoView({ block: 'nearest' }));
        }
      });
    };
    update();
    window.addEventListener('resize', update);
    visual?.addEventListener('resize', update);
    visual?.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      visual?.removeEventListener('resize', update);
      visual?.removeEventListener('scroll', update);
    };
  }, [desktop, navigate]);

  const available = Math.max(0, viewport.height - 48);
  const expandedHeight = keyboard || available < 400 ? available : position === 2 ? available - 48 : available * 0.615;
  const style = {
    '--inspector-height': position === 0 ? 'auto' : `${expandedHeight}px`,
    '--inspector-max-height': viewport.height ? `${available}px` : 'calc(100dvh - 3rem)',
    '--inspector-bottom': `${viewport.bottom}px`,
  } as CSSProperties;
  const peek = desktop === false && position === 0;

  return (
    <aside className="explore-inspector pointer-events-none z-20 flex min-h-0 w-full" style={style}
      data-testid="explore-inspector" data-collapsed={collapsed} data-position={['peek', 'half', 'full'][position]}>
      <button ref={toggleRef} type="button"
        className={`explore-inspector-toggle pointer-events-auto absolute inset-y-0 z-10 w-3 items-center justify-center border-x bg-muted text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring ${collapsed ? 'right-0' : 'left-0'}`}
        aria-label={collapsed ? t('show') : t('hide')} aria-expanded={!collapsed} aria-controls="explore-inspector-body"
        onClick={() => setCollapsed(value => !value)}>
        {collapsed ? <ChevronLeft className="size-3" /> : <ChevronRight className="size-3" />}
      </button>
      <div ref={bodyRef} id="explore-inspector-body" inert={desktop === true && collapsed}
        className={`explore-inspector-body pointer-events-auto flex min-h-0 w-full flex-col border-t bg-background/95 backdrop-blur ${desktop && collapsed ? 'invisible' : ''}`}
        onFocusCapture={event => {
          if (desktop === false && event.currentTarget.contains(event.target as Node) && (event.target as HTMLElement).matches('input:not([type="range"]):not([type="checkbox"]), textarea, [contenteditable="true"]')) {
            navigate(2);
            requestAnimationFrame(() => (event.target as HTMLElement).scrollIntoView({ block: 'nearest' }));
          }
        }}
        onKeyDown={event => {
          if (event.key !== 'Escape' || event.defaultPrevented || !event.currentTarget.contains(event.target as Node)) return;
          if (desktop) { setCollapsed(true); toggleRef.current?.focus(); }
          else if (position > 0) { navigate((position - 1) as ExplorePanelPosition); handleRef.current?.focus(); }
        }}>
        <div className="explore-inspector-header flex shrink-0 items-stretch border-b px-4">
          <button ref={handleRef} type="button"
            className="flex min-h-11 min-w-11 flex-1 touch-none items-center justify-center gap-2 text-control focus-visible:outline-2 focus-visible:outline-ring"
            disabled={keyboard} aria-label={t('expand')} aria-expanded={position > 0} aria-controls="explore-inspector-controls"
            onPointerDown={event => {
              if (keyboard || gesture.current) return;
              gesture.current = { id: event.pointerId, y: event.clientY };
              dragged.current = false;
              event.currentTarget.setPointerCapture?.(event.pointerId);
            }}
            onPointerUp={event => {
              if (gesture.current?.id !== event.pointerId) return;
              const delta = gesture.current.y - event.clientY;
              gesture.current = null;
              if (Math.abs(delta) > 40) {
                dragged.current = true;
                navigate(Math.max(0, Math.min(2, position + (delta > 0 ? 1 : -1))) as ExplorePanelPosition);
              }
            }}
            onPointerCancel={() => { gesture.current = null; }} onLostPointerCapture={() => { gesture.current = null; }}
            onClick={() => {
              if (dragged.current) { dragged.current = false; return; }
              navigate(Math.min(2, position + 1) as ExplorePanelPosition);
            }}>
            <span>{t(`positions.${['peek', 'half', 'full'][position]}`)}</span><ChevronUp aria-hidden className="size-4" />
          </button>
          <button type="button" className="flex min-h-11 min-w-11 items-center justify-center focus-visible:outline-2 focus-visible:outline-ring"
            disabled={keyboard || position === 0} aria-label={t('collapse')}
            onClick={() => navigate(Math.max(0, position - 1) as ExplorePanelPosition)}><ChevronDown aria-hidden className="size-4" /></button>
        </div>
        <div className="explore-inspector-content flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-4 py-3" data-testid="explore-inspector-content">
          {summary}
          <div id="explore-inspector-controls" inert={peek}
            className={`explore-inspector-controls flex min-h-0 flex-1 flex-col ${peek ? 'invisible max-h-0 overflow-hidden' : ''}`}>
            {children}
          </div>
        </div>
        <div ref={onToolbarMount} className="explore-artwork-bar shrink-0 border-t px-4 py-2" data-testid="explore-artwork-bar" />
      </div>
    </aside>
  );
}
