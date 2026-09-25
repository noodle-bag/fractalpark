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
  render(<MediaExportWorkspace {...props} />);
  return { props, onExportImage };
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
});
