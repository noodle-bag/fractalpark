// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ColoringPanel } from '@/components/fractal/ColoringPanel';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/components/fractal/ColorSchemeSelector', () => ({
  ColorSchemeSelector: () => <div data-testid="color-scheme-selector" />,
}));

vi.mock('@/components/fractal/GradientEditor', () => ({
  GradientEditor: () => <div data-testid="gradient-editor" />,
}));

const BASE_PROPS = {
  paletteIndex: 0,
  outsideColoring: 'smooth' as const,
  insideColoring: 'black' as const,
  orbitTrap: {
    shape: 'point' as const,
    point: [0, 0] as [number, number],
    radius: 0.35,
    width: 0.02,
  },
  customGradient: null,
  onPaletteChange: vi.fn(),
  onOutsideColoringChange: vi.fn(),
  onInsideColoringChange: vi.fn(),
  onOrbitTrapChange: vi.fn(),
  onGradientChange: vi.fn(),
};

type Rgb = [number, number, number];

function oklchToSrgb(lightness: number, chroma: number, hue: number): Rgb {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear: Rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return linear.map((channel) => {
    const clipped = Math.max(0, Math.min(1, channel));
    return clipped <= 0.0031308
      ? 12.92 * clipped
      : 1.055 * clipped ** (1 / 2.4) - 0.055;
  }) as Rgb;
}

function blend(foreground: Rgb, background: Rgb, alpha: number): Rgb {
  return foreground.map(
    (channel, index) => alpha * channel + (1 - alpha) * background[index],
  ) as Rgb;
}

function relativeLuminance(rgb: Rgb): number {
  const [red, green, blue] = rgb.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: Rgb, background: Rgb): number {
  const luminances = [
    relativeLuminance(foreground),
    relativeLuminance(background),
  ].sort((left, right) => right - left);
  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
}

describe('ColoringPanel smooth capability notice', () => {
  it.each([
    ['radial-crossing-v1', 'coloring.smoothAdapted'],
    ['escape-time', 'coloring.smoothUnavailable'],
  ] as const)('uses an opaque theme-safe warning token for %s', (method, text) => {
    render(<ColoringPanel {...BASE_PROPS} effectiveSmoothMethod={method} />);

    const note = screen.getByTestId('smooth-capability-note');
    expect(note).toHaveTextContent(text);
    expect(note).toHaveClass('text-amber-800', 'dark:text-amber-300');
    expect(note.className).not.toContain('/');
  });

  it('keeps normal small text above WCAG AA on muted/30 in both themes', () => {
    // Values are the exact current tokens from globals.css and Tailwind v4
    // theme.css. muted/30 is composited over the page background first.
    const lightSurface = blend(
      oklchToSrgb(0.97, 0, 0),
      oklchToSrgb(1, 0, 0),
      0.3,
    );
    const darkSurface = blend(
      oklchToSrgb(0.269, 0, 0),
      oklchToSrgb(0.145, 0, 0),
      0.3,
    );
    const lightRatio = contrastRatio(
      oklchToSrgb(0.473, 0.137, 46.201),
      lightSurface,
    );
    const darkRatio = contrastRatio(
      oklchToSrgb(0.879, 0.169, 91.605),
      darkSurface,
    );

    expect(lightRatio).toBeGreaterThanOrEqual(4.5);
    expect(darkRatio).toBeGreaterThanOrEqual(4.5);
    expect(lightRatio).toBeCloseTo(6.95, 1);
    expect(darkRatio).toBeCloseTo(12.91, 1);
  });
});
