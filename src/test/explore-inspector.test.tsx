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

function InspectorHarness({ onToolbarMount = vi.fn(), externalToggle = false }: { onToolbarMount?: (element: HTMLDivElement | null) => void; externalToggle?: boolean }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <>
      {externalToggle && <button type="button" onClick={() => setCollapsed(value => !value)}>Mobile toggle</button>}
      <ExploreInspector
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        onToolbarMount={onToolbarMount}
      >
        <Draft />
      </ExploreInspector>
    </>
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

it('uses the mobile split disclosure without panel-position history and retains drafts', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const previous = history.state;
  history.replaceState({ retainedRouterField: 'router-tree' }, '', location.href);
  const url = location.href;
  const { unmount } = render(<InspectorHarness externalToggle />);
  const input = screen.getByLabelText('Power draft');
  fireEvent.change(input, { target: { value: '1e-' } });
  expect(screen.getByTestId('explore-inspector')).toHaveAttribute('data-layout', 'mobile');
  expect(screen.getByTestId('explore-inspector')).not.toHaveAttribute('data-position');
  expect(screen.getByTestId('explore-artwork-bar').closest('details')).not.toHaveAttribute('open');
  fireEvent.click(screen.getByText('toolbar'));
  expect(screen.getByTestId('explore-artwork-bar').closest('details')).toHaveAttribute('open');
  fireEvent.click(screen.getByRole('button', { name: 'Mobile toggle' }));
  expect(screen.getByTestId('explore-inspector')).toHaveAttribute('data-collapsed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Mobile toggle' }));
  expect(screen.getByLabelText('Power draft')).toBe(input);
  expect(input).toHaveValue('1e-');
  expect(history.state.retainedRouterField).toBe('router-tree');
  expect(history.state.fractalParkPanel?.position).toBe(0);
  expect(location.href).toBe(url);
  unmount();
  expect(history.state.fractalParkPanel).toBeUndefined();
  history.replaceState(previous, '', url);
});
