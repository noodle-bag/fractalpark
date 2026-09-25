'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  MediaExportComposition,
  MediaExportImageFormat,
  MediaExportJpegQuality,
  MediaExportRenderQuality,
} from '@/lib/media-export';

export interface ImageExportWorkspaceSubmission {
  format: MediaExportImageFormat;
  width: number;
  height: number;
  renderQuality: MediaExportRenderQuality;
  jpegQuality?: MediaExportJpegQuality;
  background: string;
  filename?: string;
  composition: MediaExportComposition;
}

interface MediaExportWorkspaceProps {
  open: boolean;
  pending: boolean;
  frameReady: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: () => void;
  onPreviewImage?: (submission: ImageExportWorkspaceSubmission, signal: AbortSignal) => Promise<Blob>;
  onExportImage: (submission: ImageExportWorkspaceSubmission) => Promise<boolean>;
}

const IMAGE_PRESETS = [
  { id: 'square-default', width: 2048, height: 2048 },
  { id: 'portrait-default', width: 2000, height: 3000 },
  { id: 'landscape-default', width: 1920, height: 1080 },
  { id: 'social-default', width: 1200, height: 628 },
] as const;

const DEFAULT_COMPOSITION: MediaExportComposition = {
  mode: 'fit', baseline: 'fit', panX: 0, panY: 0, scale: 1, rotation: 0,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizedRotation(value: number): number {
  const full = Math.PI * 2;
  return ((value + Math.PI) % full + full) % full - Math.PI;
}

function customComposition(
  current: MediaExportComposition,
  updates: Partial<MediaExportComposition>,
): MediaExportComposition {
  return { ...current, ...updates, mode: 'custom' };
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

type GestureSnapshot = {
  composition: MediaExportComposition;
  centroidX: number;
  centroidY: number;
  distance: number;
  angle: number;
};

export function MediaExportWorkspace({
  open,
  pending,
  frameReady,
  onOpenChange,
  onCloseAutoFocus,
  onPreviewImage,
  onExportImage,
}: MediaExportWorkspaceProps) {
  const t = useTranslations('explore.artworkActions.export');
  const [tab, setTab] = useState<'image' | 'animation'>('image');
  const [format, setFormat] = useState<MediaExportImageFormat>('png');
  const [preset, setPreset] = useState<(typeof IMAGE_PRESETS)[number]>(IMAGE_PRESETS[2]);
  const [renderQuality, setRenderQuality] = useState<MediaExportRenderQuality>('high');
  const [jpegQuality, setJpegQuality] = useState<MediaExportJpegQuality>('high');
  const [background, setBackground] = useState('#10131a');
  const [filename, setFilename] = useState('');
  const [composition, setComposition] = useState<MediaExportComposition>(DEFAULT_COMPOSITION);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [previewState, setPreviewState] = useState<'idle' | 'rendering' | 'ready' | 'failed'>('idle');
  const previewUrlRef = useRef<string | undefined>(undefined);
  const generationRef = useRef(0);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<GestureSnapshot | undefined>(undefined);

  const submission = useMemo<ImageExportWorkspaceSubmission>(() => ({
    format,
    width: preset.width,
    height: preset.height,
    renderQuality,
    jpegQuality: format === 'jpeg' ? jpegQuality : undefined,
    background,
    filename: filename.trim() || undefined,
    composition,
  }), [background, composition, filename, format, jpegQuality, preset, renderQuality]);

  useEffect(() => {
    if (!open || tab !== 'image' || !frameReady || !onPreviewImage) return;
    const generation = ++generationRef.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setPreviewState('rendering');
      void onPreviewImage(submission, controller.signal).then(blob => {
        if (controller.signal.aborted || generation !== generationRef.current) return;
        const nextUrl = URL.createObjectURL(blob);
        const previousUrl = previewUrlRef.current;
        previewUrlRef.current = nextUrl;
        setPreviewUrl(nextUrl);
        setPreviewState('ready');
        if (previousUrl) URL.revokeObjectURL(previousUrl);
      }).catch(error => {
        if (controller.signal.aborted || generation !== generationRef.current) return;
        setPreviewState('failed');
        if (process.env.NODE_ENV === 'development') console.warn('Media export preview failed.', error);
      });
    }, 120);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [frameReady, onPreviewImage, open, submission, tab]);

  useEffect(() => {
    if (open) return;
    generationRef.current += 1;
    const url = previewUrlRef.current;
    previewUrlRef.current = undefined;
    if (url) URL.revokeObjectURL(url);
    const timer = window.setTimeout(() => {
      setPreviewUrl(undefined);
      setPreviewState('idle');
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const submit = async () => {
    if (pending || !frameReady || tab !== 'image') return;
    const succeeded = await onExportImage(submission);
    if (succeeded) onOpenChange(false);
  };

  const setMode = (mode: 'fit' | 'fill') => {
    setComposition({ mode, baseline: mode, panX: 0, panY: 0, scale: 1, rotation: 0 });
  };

  const resetComposition = () => setComposition({ ...DEFAULT_COMPOSITION });

  const startGesture = (element: HTMLElement) => {
    const points = [...pointersRef.current.values()];
    if (points.length === 0) {
      gestureRef.current = undefined;
      return;
    }
    const first = points[0];
    const second = points[1] ?? first;
    gestureRef.current = {
      composition,
      centroidX: (first.x + second.x) / 2,
      centroidY: (first.y + second.y) / 2,
      distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      angle: Math.atan2(second.y - first.y, second.x - first.x),
    };
    element.style.cursor = points.length > 1 ? 'grabbing' : 'move';
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    startGesture(event.currentTarget);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId) || !gestureRef.current) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointersRef.current.values()];
    const first = points[0];
    const second = points[1] ?? first;
    const centroidX = (first.x + second.x) / 2;
    const centroidY = (first.y + second.y) / 2;
    const rect = event.currentTarget.getBoundingClientRect();
    const base = gestureRef.current;
    const updates: Partial<MediaExportComposition> = {
      panX: base.composition.panX - (centroidX - base.centroidX) / Math.max(1, rect.width),
      panY: base.composition.panY - (centroidY - base.centroidY) / Math.max(1, rect.height),
    };
    if (points.length > 1) {
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      const angle = Math.atan2(second.y - first.y, second.x - first.x);
      updates.scale = clamp(base.composition.scale * distance / base.distance, 0.25, 8);
      updates.rotation = normalizedRotation(base.composition.rotation + angle - base.angle);
    }
    setComposition(customComposition(base.composition, updates));
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    startGesture(event.currentTarget);
    if (pointersRef.current.size === 0) event.currentTarget.style.cursor = '';
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setComposition(current => customComposition(current, {
      scale: clamp(current.scale * Math.exp(-event.deltaY * 0.0015), 0.25, 8),
    }));
  };

  const rawMegabytes = preset.width * preset.height * 4 / (1024 * 1024);
  const ratioDivisor = greatestCommonDivisor(preset.width, preset.height);
  const ratio = `${preset.width / ratioDivisor}:${preset.height / ratioDivisor}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(92dvh,880px)] w-[min(1180px,calc(100%-1rem))] max-w-none flex-col overflow-hidden p-0 sm:max-w-none"
        onCloseAutoFocus={(event) => { event.preventDefault(); onCloseAutoFocus(); }}
      >
        <DialogHeader className="border-b px-4 py-4 pr-12 sm:px-6">
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={value => setTab(value as 'image' | 'animation')} className="min-h-0 flex-1 gap-0">
          <div className="border-b px-4 sm:px-6">
            <TabsList variant="line" className="w-full">
              <TabsTrigger value="image" className="flex-1">{t('tabs.image')}</TabsTrigger>
              <TabsTrigger value="animation" className="flex-1">{t('tabs.animation')}</TabsTrigger>
            </TabsList>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <TabsContent value="image" forceMount className={tab === 'image' ? 'grid min-h-full lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]' : 'hidden'}>
              <div className="flex min-h-64 flex-col items-center justify-start gap-3 bg-[linear-gradient(45deg,#ddd_25%,transparent_25%),linear-gradient(-45deg,#ddd_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#ddd_75%),linear-gradient(-45deg,transparent_75%,#ddd_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0] p-4 dark:bg-neutral-950 sm:p-6 lg:sticky lg:top-0 lg:self-start" aria-label={t('preview')}>
                <div
                  data-testid="media-export-preview"
                  className={`relative max-h-[58dvh] w-full max-w-2xl touch-none select-none overflow-hidden rounded-md border shadow-xl ${format === 'png' ? 'bg-[linear-gradient(45deg,#bbb_25%,transparent_25%),linear-gradient(-45deg,#bbb_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#bbb_75%),linear-gradient(-45deg,transparent_75%,#bbb_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0]' : ''}`}
                  style={{ aspectRatio: `${preset.width} / ${preset.height}`, backgroundColor: format === 'jpeg' ? background : undefined }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerEnd}
                  onPointerCancel={onPointerEnd}
                  onWheel={onWheel}
                >
                  {/* Blob URLs are local render results and cannot use Next image optimization. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {previewUrl && <img src={previewUrl} alt={t('previewImageAlt')} draggable={false} className="h-full w-full object-fill" />}
                  {!previewUrl && <div className="grid h-full place-items-center px-4 text-center text-sm text-white/75">{t(previewState === 'failed' ? 'previewFailed' : 'previewPreparing')}</div>}
                  {previewState === 'rendering' && previewUrl && <div className="absolute right-2 top-2 rounded bg-black/65 px-2 py-1 text-xs text-white">{t('previewUpdating')}</div>}
                </div>
                <p className="text-center text-xs text-muted-foreground" aria-live="polite">{t('previewCurrentFrame')} · {t(`previewState.${previewState}`)}</p>
              </div>
              <div className="space-y-5 border-t p-4 lg:border-l lg:border-t-0 lg:p-6">
                <Field label={t('format')}>
                  <select className="min-h-11 w-full rounded-md border bg-background px-3" value={format} onChange={event => setFormat(event.target.value as MediaExportImageFormat)}>
                    <option value="png">PNG</option><option value="jpeg">JPEG</option>
                  </select>
                </Field>
                <Field label={t('size')}>
                  <select className="min-h-11 w-full rounded-md border bg-background px-3" value={preset.id} onChange={event => setPreset(IMAGE_PRESETS.find(item => item.id === event.target.value) ?? IMAGE_PRESETS[2])}>
                    {IMAGE_PRESETS.map(item => <option key={item.id} value={item.id}>{item.width} × {item.height}</option>)}
                  </select>
                </Field>
                <fieldset className="space-y-3">
                  <legend className="font-medium">{t('composition.title')}</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {(['fit', 'fill'] as const).map(mode => <Button key={mode} type="button" aria-pressed={composition.mode === mode} variant={composition.mode === mode ? 'default' : 'outline'} onClick={() => setMode(mode)}>{t(`composition.${mode}`)}</Button>)}
                    <Button type="button" aria-pressed={composition.mode === 'custom'} variant={composition.mode === 'custom' ? 'default' : 'outline'} onClick={() => setComposition(current => customComposition(current, {}))}>{t('composition.custom')}</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('composition.gestureHint')}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <NumericField label={t('composition.panX')} value={composition.panX} step={0.01} onChange={panX => setComposition(current => customComposition(current, { panX }))} />
                    <NumericField label={t('composition.panY')} value={composition.panY} step={0.01} onChange={panY => setComposition(current => customComposition(current, { panY }))} />
                    <NumericField label={t('composition.zoom')} value={composition.scale} min={0.25} max={8} step={0.05} onChange={scale => setComposition(current => customComposition(current, { scale: clamp(scale, 0.25, 8) }))} />
                    <NumericField label={t('composition.rotation')} value={Math.round(composition.rotation * 180 / Math.PI * 100) / 100} min={-180} max={180} step={1} onChange={degrees => setComposition(current => customComposition(current, { rotation: normalizedRotation(degrees * Math.PI / 180) }))} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Button type="button" variant="outline" aria-label={t('composition.rotateLeft')} onClick={() => setComposition(current => customComposition(current, { rotation: normalizedRotation(current.rotation - Math.PI / 12) }))}>−15°</Button>
                    <Button type="button" variant="outline" onClick={resetComposition}>{t('composition.reset')}</Button>
                    <Button type="button" variant="outline" aria-label={t('composition.rotateRight')} onClick={() => setComposition(current => customComposition(current, { rotation: normalizedRotation(current.rotation + Math.PI / 12) }))}>+15°</Button>
                  </div>
                </fieldset>
                <Field label={t('renderQuality')}>
                  <select className="min-h-11 w-full rounded-md border bg-background px-3" value={renderQuality} onChange={event => setRenderQuality(event.target.value as MediaExportRenderQuality)}>
                    {(['off', 'standard', 'high', 'ultra'] as const).map(value => <option key={value} value={value}>{t(`quality.${value}`)}</option>)}
                  </select>
                </Field>
                {format === 'jpeg' && <Field label={t('jpegQuality')}>
                  <select className="min-h-11 w-full rounded-md border bg-background px-3" value={jpegQuality} onChange={event => setJpegQuality(event.target.value as MediaExportJpegQuality)}>
                    {(['balanced', 'high', 'maximum'] as const).map(value => <option key={value} value={value}>{t(`jpeg.${value}`)}</option>)}
                  </select>
                </Field>}
                <Field label={t('background')}><Input type="color" value={background} onChange={event => setBackground(event.target.value)} className="min-h-11" /></Field>
                <Field label={t('filename')}><Input value={filename} onChange={event => setFilename(event.target.value)} placeholder={t('filenamePlaceholder')} /></Field>
                <div className="rounded-md border bg-muted/35 p-3 text-sm" data-testid="media-export-summary">
                  <p className="font-medium">{t('summary.title')}</p>
                  <p>{t('summary.details', { format: format.toUpperCase(), width: preset.width, height: preset.height, megapixels: (preset.width * preset.height / 1_000_000).toFixed(1) })}</p>
                  <p>{t('summary.settings', { ratio, antialiasing: t(`quality.${renderQuality}`), encoding: format === 'jpeg' ? t(`jpeg.${jpegQuality}`) : t('summary.lossless') })}</p>
                  <p className="text-muted-foreground">{t('summary.memory', { megabytes: rawMegabytes.toFixed(1) })}</p>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="animation" forceMount className={tab === 'animation' ? 'grid min-h-72 place-items-center p-8 text-center' : 'hidden'}>
              <div className="max-w-md space-y-2"><h3 className="font-medium">{t('animation.title')}</h3><p className="text-sm text-muted-foreground">{t('animation.preparing')}</p></div>
            </TabsContent>
          </div>
        </Tabs>
        <DialogFooter className="border-t p-4 sm:px-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
          <Button disabled={pending || !frameReady || tab !== 'image'} onClick={submit}>{pending ? t('pending') : t('confirm')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <Label className="block space-y-2"><span className="block">{label}</span>{children}</Label>;
}

function NumericField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step: number;
}) {
  return <Label className="space-y-1 text-xs"><span>{label}</span><Input type="number" value={value} min={min} max={max} step={step} onChange={event => { const next = event.currentTarget.valueAsNumber; if (Number.isFinite(next)) onChange(next); }} /></Label>;
}
