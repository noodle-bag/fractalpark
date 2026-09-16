import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ExploreInspector } from '@/components/fractal/ExploreInspector';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Draft() {
  const [value, setValue] = useState('2');
  return <input aria-label="Power draft" value={value} onChange={event => setValue(event.target.value)} />;
}

function InspectorHarness({ onToolbarMount = vi.fn() }: { onToolbarMount?: (element: HTMLDivElement | null) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <ExploreInspector
      collapsed={collapsed}
      onCollapsedChange={setCollapsed}
      onToolbarMount={onToolbarMount}
    >
      <Draft />
    </ExploreInspector>
  );
}

it('preserves the mounted draft and toolbar host while hiding controls', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const host = vi.fn();
  render(<InspectorHarness onToolbarMount={host} />);
  expect(screen.getByTestId('explore-inspector')).toHaveAttribute('data-collapsed', 'false');
  const input = screen.getByLabelText('Power draft');
  const toolbar = screen.getByTestId('explore-artwork-bar');
  fireEvent.change(input, { target: { value: '-0.' } });
  fireEvent.keyDown(input, { key: 'Escape' });
  const toggle = screen.getByRole('button', { name: 'show' });
  expect(toggle).toHaveFocus();
  expect(input.closest('[inert]')).not.toBeNull();
  fireEvent.click(toggle);
  expect(screen.getByLabelText('Power draft')).toBe(input);
  expect(input).toHaveValue('-0.');
  expect(screen.getByTestId('explore-artwork-bar')).toBe(toolbar);
  expect(screen.getByRole('button', { name: 'hide' })).toHaveAttribute('aria-expanded', 'true');
  expect(host.mock.calls.filter(([element]) => element !== null)).toHaveLength(1);
});

it('uses same-URL mobile history while retaining drafts and existing history fields', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const previous = history.state;
  history.replaceState({ retainedRouterField: 'router-tree' }, '', location.href);
  const url = location.href;
  const { unmount } = render(<InspectorHarness />);
  const input = screen.getByLabelText('Power draft');
  fireEvent.change(input, { target: { value: '1e-' } });
  // Model the router replacing the initial hydration entry.
  history.replaceState({ retainedRouterField: 'router-tree' }, '', url);
  fireEvent.click(screen.getByRole('button', { name: 'expand' }));
  const half = history.state;
  expect(half.retainedRouterField).toBe('router-tree');
  expect(screen.getByTestId('explore-inspector')).toHaveAttribute('data-position', 'half');
  fireEvent.click(screen.getByRole('button', { name: 'expand' }));
  expect(screen.getByTestId('explore-inspector')).toHaveAttribute('data-position', 'full');
  // The event target is authoritative even if another consumer updates history.
  fireEvent(window, new PopStateEvent('popstate', { state: half }));
  expect(screen.getByTestId('explore-inspector')).toHaveAttribute('data-position', 'half');
  expect(screen.getByLabelText('Power draft')).toBe(input);
  expect(input).toHaveValue('1e-');
  expect(location.href).toBe(url);
  unmount();
  expect(history.state.fractalParkPanel).toBeUndefined();
  history.replaceState(previous, '', url);
});
