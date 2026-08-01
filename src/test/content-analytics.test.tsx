import { StrictMode } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ContentViewTracker,
  TrackedContentLink,
} from '@/components/analytics/ContentAnalytics';
import { CopyPageLinkButton } from '@/components/artwork/CopyPageLinkButton';

describe('content analytics', () => {
  afterEach(() => {
    window.gtag = undefined;
  });

  it('sends a content view once when Strict Mode replays effects', () => {
    window.gtag = vi.fn();

    render(
      <StrictMode>
        <ContentViewTracker
          eventName="view_formula"
          eventParams={{ formula_id: 'mandelbrot', locale: 'en' }}
        />
      </StrictMode>
    );

    expect(window.gtag).toHaveBeenCalledTimes(1);
    expect(window.gtag).toHaveBeenCalledWith('event', 'view_formula', {
      formula_id: 'mandelbrot',
      locale: 'en',
    });
  });

  it('sends another view when a preserved route component changes identity', () => {
    window.gtag = vi.fn();
    const { rerender } = render(
      <ContentViewTracker
        eventName="view_formula"
        eventParams={{ formula_id: 'mandelbrot', locale: 'en' }}
      />
    );

    rerender(
      <ContentViewTracker
        eventName="view_formula"
        eventParams={{ formula_id: 'tricorn', locale: 'en' }}
      />
    );

    expect(window.gtag).toHaveBeenCalledTimes(2);
    expect(window.gtag).toHaveBeenLastCalledWith('event', 'view_formula', {
      formula_id: 'tricorn',
      locale: 'en',
    });
  });

  it('sends each deliberate tracked-link activation without blocking it', () => {
    window.gtag = vi.fn();
    const handleClick = vi.fn((event: React.MouseEvent) => {
      event.preventDefault();
    });
    const { getByRole } = render(
      <TrackedContentLink
        eventName="start_remix"
        eventParams={{ source_type: 'formula', source_id: 'mandelbrot' }}
        href="/en/explore?remix=formula%3Amandelbrot"
        onClick={handleClick}
      >
        Remix
      </TrackedContentLink>
    );

    fireEvent.click(getByRole('link', { name: 'Remix' }));
    fireEvent.click(getByRole('link', { name: 'Remix' }));

    expect(handleClick).toHaveBeenCalledTimes(2);
    expect(window.gtag).toHaveBeenCalledTimes(2);
    expect(window.gtag).toHaveBeenLastCalledWith('event', 'start_remix', {
      source_type: 'formula',
      source_id: 'mandelbrot',
    });
  });

  it('tracks Copy page link only after the clipboard succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    window.gtag = vi.fn();
    const labels = { copy: 'Copy', copied: 'Copied', error: 'Error' };
    const { getByRole } = render(
      <CopyPageLinkButton labels={labels} presetId="preset-test" />
    );

    fireEvent.click(getByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(window.gtag).toHaveBeenCalledWith('event', 'copy_page_link', {
      preset_id: 'preset-test',
    });
  });

  it('does not track a failed Copy page link action', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    window.gtag = vi.fn();
    const labels = { copy: 'Copy', copied: 'Copied', error: 'Error' };
    const { getByRole } = render(
      <CopyPageLinkButton labels={labels} presetId="preset-test" />
    );

    fireEvent.click(getByRole('button', { name: 'Copy' }));

    await waitFor(() =>
      expect(getByRole('button', { name: 'Error' })).toBeVisible()
    );
    expect(window.gtag).not.toHaveBeenCalled();
  });
});
