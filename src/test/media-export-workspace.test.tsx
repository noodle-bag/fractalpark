import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  MediaExportWorkspace,
  type AnimationExportWorkspaceSubmission,
} from '@/components/fractal/MediaExportWorkspace';
import type { AnimationFramePipelineProgress } from '@/lib/media-export-animation';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

function setup(overrides: Partial<ComponentProps<typeof MediaExportWorkspace>> = {}) {
  const onExportImage = vi.fn(async () => true);
  const onExportAnimation = vi.fn(async () => true);
  const props = {
    open: true,
    pending: false,
    frameReady: true,
    onOpenChange: vi.fn(),
    onCloseAutoFocus: vi.fn(),
    onExportImage,
    onExportAnimation,
    ...overrides,
  };
  const view = render(<MediaExportWorkspace {...props} />);
  return { props, onExportImage, onExportAnimation, view };
}

describe('MediaExportWorkspace', () => {
  it('exposes one accessible Image/Animation workspace and restores the Image panel', () => {
    setup();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'tabs.image' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'tabs.animation' }), { button: 0, ctrlKey: false });
    return waitFor(() => expect(screen.getByRole('button', { name: 'confirm' })).toBeDisabled()).then(() => {
      fireEvent.click(screen.getByRole('tab', { name: 'tabs.image' }));
      expect(screen.getByLabelText('preview')).toBeVisible();
    });
  });

  it('submits exact Image settings and closes only after success', async () => {
    const { props, onExportImage } = setup();
    fireEvent.change(screen.getByDisplayValue('PNG'), { target: { value: 'jpeg' } });
    fireEvent.change(screen.getByDisplayValue('1920 × 1080'), { target: { value: 'square-default' } });
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => expect(onExportImage).toHaveBeenCalledWith(expect.objectContaining({
      format: 'jpeg', width: 2048, height: 2048, renderQuality: 'high', jpegQuality: 'high', background: '#ffffff',
    })));
    expect(screen.queryByText('background')).not.toBeInTheDocument();
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps export disabled while the matching frame is not ready', () => {
    setup({ frameReady: false });
    expect(screen.getByRole('button', { name: 'confirm' })).toBeDisabled();
  });

  it('submits an approved animation profile, keeps the completed state visible, and uses fixed black', async () => {
    const repeatDownload = vi.fn();
    const onExportAnimation = vi.fn(async (
      _submission: AnimationExportWorkspaceSubmission,
      _signal: AbortSignal,
      onProgress: (progress: AnimationFramePipelineProgress) => void,
    ) => {
      onProgress({ phase: 'encoding', completed: 120, total: 120, rendered: 120, encoded: 120, queued: 0 });
      return { succeeded: true, repeatDownload };
    });
    const { props } = setup({
      animationAvailable: true,
      animationSpeed: 4,
      animationDuration: 18,
      onExportAnimation,
    });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'tabs.animation' }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(screen.getByTestId('media-export-animation-summary')).toBeVisible());
    fireEvent.change(screen.getByDisplayValue('MP4'), { target: { value: 'webm' } });
    fireEvent.change(screen.getByDisplayValue('1920 × 1080'), { target: { value: 'landscape-uhd' } });
    fireEvent.change(screen.getByDisplayValue('60 FPS'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => expect(onExportAnimation).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'webm', width: 3840, height: 2160, fps: 30, videoQuality: 'high', background: '#000000' }),
      expect.any(AbortSignal),
      expect.any(Function),
    ));
    expect(props.onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByText('animation.completed')).toBeVisible();
    expect(screen.getByText('100%')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'downloadAgain' }));
    expect(repeatDownload).toHaveBeenCalledOnce();
  });

  it('disables an unsupported exact animation profile and names the fallback path', async () => {
    const onProbeAnimation = vi.fn(async () => ({
      qualified: false as const,
      reason: 'profile-unavailable' as const,
    }));
    const { onExportAnimation } = setup({
      animationAvailable: true,
      animationSpeed: 4,
      animationDuration: 18,
      onProbeAnimation,
    });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'tabs.animation' }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(onProbeAnimation).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'mp4', width: 1920, height: 1080, fps: 60 }),
      expect.any(AbortSignal),
    ));
    await waitFor(() => expect(screen.getByText('animation.capability.profile-unavailable')).toBeVisible());
    expect(screen.getByRole('button', { name: 'confirm' })).toBeDisabled();
    expect(onExportAnimation).not.toHaveBeenCalled();
  });

  it('aborts active animation work without treating cancellation as dialog success', async () => {
    let capturedSignal: AbortSignal | undefined;
    const onExportAnimation = vi.fn((_submission, signal: AbortSignal) => {
      capturedSignal = signal;
      return new Promise<boolean>(resolve => signal.addEventListener('abort', () => resolve(false), { once: true }));
    });
    const { props } = setup({
      animationAvailable: true,
      animationSpeed: 4,
      animationDuration: 18,
      onExportAnimation,
    });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'tabs.animation' }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(screen.getByTestId('media-export-animation-summary')).toBeVisible());
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'animation.cancelExport' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'animation.cancelExport' }));
    await waitFor(() => expect(capturedSignal?.aborted).toBe(true));
    expect(props.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('coalesces preview changes without interrupting the active render and revokes object URLs', async () => {
    const createObjectURL = vi.fn(() => 'blob:latest-preview');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const signals: AbortSignal[] = [];
    let resolveFirst: ((blob: Blob) => void) | undefined;
    const onPreviewImage = vi.fn((_submission: unknown, signal: AbortSignal) => {
      signals.push(signal);
      if (signals.length === 1) return new Promise<Blob>(resolve => { resolveFirst = resolve; });
      return Promise.resolve(new Blob(['preview'], { type: 'image/png' }));
    });
    const { onExportImage, view } = setup({ onPreviewImage });

    await waitFor(() => expect(onPreviewImage).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'composition.fill' }));
    fireEvent.change(screen.getByLabelText('composition.zoom'), { target: { value: '2' } });
    expect(signals[0]?.aborted).toBe(false);
    expect(onPreviewImage).toHaveBeenCalledTimes(1);
    resolveFirst?.(new Blob(['first'], { type: 'image/png' }));
    await waitFor(() => expect(screen.getByRole('img', { name: 'previewImageAlt' })).toHaveAttribute('src', 'blob:latest-preview'));
    await waitFor(() => expect(onPreviewImage).toHaveBeenCalledTimes(2));
    expect(onPreviewImage.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      composition: expect.objectContaining({ mode: 'custom', baseline: 'fill', scale: 2 }),
    }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => expect(onExportImage).toHaveBeenCalledWith(expect.objectContaining({
      composition: expect.objectContaining({ mode: 'custom', baseline: 'fill', scale: 2 }),
    })));
    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:latest-preview');
  });

  it('matches Explore vertical drag direction and exposes a constrained always-on scroll viewport', async () => {
    setup({ onPreviewImage: async () => new Blob(['preview'], { type: 'image/png' }) });
    const preview = screen.getByTestId('media-export-preview');
    Object.defineProperty(preview, 'setPointerCapture', { configurable: true, value: vi.fn() });
    Object.defineProperty(preview, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 200, height: 100, x: 0, y: 0, top: 0, left: 0, right: 200, bottom: 100, toJSON: () => ({}) }),
    });
    fireEvent.pointerDown(preview, { pointerId: 1, clientX: 50, clientY: 40 });
    fireEvent.pointerMove(preview, { pointerId: 1, clientX: 50, clientY: 60 });
    fireEvent.pointerUp(preview, { pointerId: 1, clientX: 50, clientY: 60 });
    await waitFor(() => expect(screen.getByLabelText('composition.panY')).toHaveValue(0.2));
    expect(screen.getByTestId('media-export-scroll-area')).toHaveClass('h-0');
    expect(document.querySelector('[data-slot="scroll-area-scrollbar"]')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('img', { name: 'previewImageAlt' })).toHaveClass('object-contain'));
  });

  it('keeps portrait preview geometry proportional and shows progress outside the scroll viewport immediately', async () => {
    let finishExport: ((value: boolean) => void) | undefined;
    setup({
      animationAvailable: true,
      animationDuration: 18,
      onExportAnimation: vi.fn(() => new Promise<boolean>(resolve => { finishExport = resolve; })),
    });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'tabs.animation' }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(screen.getByTestId('media-export-animation-summary')).toBeVisible());
    fireEvent.change(screen.getByDisplayValue('1920 × 1080'), { target: { value: 'portrait-uhd' } });
    const preview = screen.getByTestId('media-export-animation-preview');
    expect(preview).toHaveStyle({ aspectRatio: '2160 / 3840' });
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => expect(screen.getByTestId('media-export-animation-progress')).toBeVisible());
    expect(screen.getByText('animation.preparing')).toBeVisible();
    expect(screen.getByTestId('media-export-animation-progress').parentElement).toBe(screen.getByRole('dialog'));
    finishExport?.(true);
    await waitFor(() => expect(screen.getByText('animation.completed')).toBeVisible());
  });
});
