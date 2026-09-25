import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { MediaExportWorkspace } from '@/components/fractal/MediaExportWorkspace';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function setup(overrides: Partial<ComponentProps<typeof MediaExportWorkspace>> = {}) {
  const onExportImage = vi.fn(async () => true);
  const props = {
    open: true,
    pending: false,
    frameReady: true,
    onOpenChange: vi.fn(),
    onCloseAutoFocus: vi.fn(),
    onExportImage,
    ...overrides,
  };
  const view = render(<MediaExportWorkspace {...props} />);
  return { props, onExportImage, view };
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
