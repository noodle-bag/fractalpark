import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { MediaExportWorkspace } from '@/components/fractal/MediaExportWorkspace';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

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
      format: 'jpeg', width: 2048, height: 2048, renderQuality: 'high', jpegQuality: 'high',
    })));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps export disabled while the matching frame is not ready', () => {
    setup({ frameReady: false });
    expect(screen.getByRole('button', { name: 'confirm' })).toBeDisabled();
  });

  it('submits an approved animation profile with speed-derived summary and progress', async () => {
    const { props, onExportAnimation } = setup({
      animationAvailable: true,
      animationSpeed: 4,
      animationDuration: 18,
    });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'tabs.animation' }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(screen.getByTestId('media-export-animation-summary')).toBeVisible());
    fireEvent.change(screen.getByDisplayValue('MP4'), { target: { value: 'webm' } });
    fireEvent.change(screen.getByDisplayValue('1920 × 1080'), { target: { value: 'landscape-uhd' } });
    fireEvent.change(screen.getByDisplayValue('60 FPS'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => expect(onExportAnimation).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'webm', width: 3840, height: 2160, fps: 30, videoQuality: 'high' }),
      expect.any(AbortSignal),
      expect.any(Function),
    ));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
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

  it('cancels stale preview work, keeps one composition contract, and revokes the object URL', async () => {
    const createObjectURL = vi.fn(() => 'blob:latest-preview');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const signals: AbortSignal[] = [];
    const onPreviewImage = vi.fn((_submission: unknown, signal: AbortSignal) => {
      signals.push(signal);
      if (signals.length === 1) return new Promise<Blob>(() => undefined);
      if (signals.length === 3) return Promise.reject(new Error('preview failed'));
      return Promise.resolve(new Blob(['preview'], { type: 'image/png' }));
    });
    const { onExportImage, view } = setup({ onPreviewImage });

    await waitFor(() => expect(onPreviewImage).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'composition.fill' }));
    expect(signals[0]?.aborted).toBe(true);
    await waitFor(() => expect(screen.getByRole('img', { name: 'previewImageAlt' })).toHaveAttribute('src', 'blob:latest-preview'));
    fireEvent.change(screen.getByLabelText('composition.zoom'), { target: { value: '2' } });
    await waitFor(() => expect(onPreviewImage).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getByText(/previewState.failed/)).toBeVisible());
    expect(screen.getByRole('img', { name: 'previewImageAlt' })).toHaveAttribute('src', 'blob:latest-preview');
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => expect(onExportImage).toHaveBeenCalledWith(expect.objectContaining({
      composition: expect.objectContaining({ mode: 'custom', baseline: 'fill', scale: 2 }),
    })));
    expect(onPreviewImage.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      composition: expect.objectContaining({ mode: 'fill', baseline: 'fill' }),
    }));

    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:latest-preview');
  });
});
