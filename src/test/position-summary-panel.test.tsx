// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PositionSummaryPanel } from '@/components/fractal/PositionSummaryPanel';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('PositionSummaryPanel', () => {
  it('keeps the localized position summary in one non-overflowing row', () => {
    render(
      <PositionSummaryPanel
        bounds={{ centerX: -0.5, centerY: 0.125, zoom: 0.4, rotation: 0 }}
      />,
    );

    const summary = screen.getByTestId('position-summary');
    expect(summary).toHaveClass(
      'grid-cols-[auto_minmax(0,1fr)_auto]',
      'overflow-hidden',
      'whitespace-nowrap',
    );
    expect(screen.getByLabelText('center: -0.5000, 0.1250')).toBeInTheDocument();
    expect(screen.getByLabelText('zoom: 0.40x')).toBeInTheDocument();
  });
});