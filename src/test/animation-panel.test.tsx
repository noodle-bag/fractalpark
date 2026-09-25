import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AnimationPanel } from '@/components/fractal/AnimationPanel';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

describe('AnimationPanel playback speed', () => {
  it('uses an index-snapped native range for the nine approved speeds', () => {
    const onSpeedChange = vi.fn();
    render(<AnimationPanel
      keyframes={[]}
      bounds={{ centerX: 0, centerY: 0, zoom: 1, rotation: 0 }}
      onKeyframesChange={vi.fn()}
      onPreviewToggle={vi.fn()}
      isPreviewPlaying={false}
      speed={1}
      onSpeedChange={onSpeedChange}
    />);

    const slider = screen.getByRole('slider', { name: 'speed' });
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '8');
    expect(slider).toHaveAttribute('step', '1');
    expect(slider).toHaveValue('3');
    expect(slider).toHaveAttribute('aria-valuetext', '1×');
    fireEvent.change(slider, { target: { value: '0' } });
    fireEvent.change(slider, { target: { value: '8' } });
    expect(onSpeedChange.mock.calls).toEqual([[0.25], [4]]);
  });
});
