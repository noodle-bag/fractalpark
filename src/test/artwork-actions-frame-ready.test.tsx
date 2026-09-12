import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ArtworkActions } from '@/components/fractal/ArtworkActions';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
afterEach(cleanup);

it('blocks capture buttons and an already open save dialog until a matching frame is ready', () => {
  const props = {
    status: { phase: 'idle' as const }, defaultSaveName: 'Test',
    onClearStatus: vi.fn(), onSave: vi.fn(), onDownload: vi.fn(),
    onImport: vi.fn(), onExport: vi.fn(), onReset: vi.fn(),
  };
  const { rerender } = render(<ArtworkActions {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'save.label' }));
  rerender(<ArtworkActions {...props} frameReady={false} />);
  expect(screen.getByRole('button', { name: 'save.confirm' })).toBeDisabled();
  fireEvent.keyDown(screen.getByLabelText('save.name'), { key: 'Enter' });
  expect(props.onSave).not.toHaveBeenCalled();
  rerender(<ArtworkActions {...props} frameReady />);
  expect(screen.getByRole('button', { name: 'save.confirm' })).toBeEnabled();
});

it('keeps import, reset and document download available while capture is blocked', () => {
  render(<ArtworkActions
    status={{ phase: 'idle' }} defaultSaveName="Test" frameReady={false}
    onClearStatus={vi.fn()} onSave={vi.fn()} onDownload={vi.fn()}
    onImport={vi.fn()} onExport={vi.fn()} onReset={vi.fn()}
  />);
  expect(screen.getByRole('button', { name: 'save.label' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'export.label' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'import.label' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'download.label' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'reset.label' })).toBeEnabled();
});
