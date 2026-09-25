'use client';

import { useState, type ReactNode } from 'react';
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
}

interface MediaExportWorkspaceProps {
  open: boolean;
  pending: boolean;
  frameReady: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: () => void;
  onExportImage: (submission: ImageExportWorkspaceSubmission) => Promise<boolean>;
}

const IMAGE_PRESETS = [
  { id: 'square-default', width: 2048, height: 2048 },
  { id: 'portrait-default', width: 2000, height: 3000 },
  { id: 'landscape-default', width: 1920, height: 1080 },
  { id: 'social-default', width: 1200, height: 628 },
] as const;

export function MediaExportWorkspace({
  open,
  pending,
  frameReady,
  onOpenChange,
  onCloseAutoFocus,
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

  const submit = async () => {
    if (pending || !frameReady || tab !== 'image') return;
    const succeeded = await onExportImage({
      format,
      width: preset.width,
      height: preset.height,
      renderQuality,
      jpegQuality: format === 'jpeg' ? jpegQuality : undefined,
      background,
      filename: filename.trim() || undefined,
    });
    if (succeeded) onOpenChange(false);
  };

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
              <div className="grid min-h-64 place-items-center bg-[linear-gradient(45deg,#ddd_25%,transparent_25%),linear-gradient(-45deg,#ddd_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#ddd_75%),linear-gradient(-45deg,transparent_75%,#ddd_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0] p-6 dark:bg-neutral-950" aria-label={t('preview')}>
                <div className="aspect-video w-full max-w-2xl rounded-md border bg-black/80 shadow-xl" />
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
