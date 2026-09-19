import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Navbar from '@/components/layout/Navbar';
import enMessages from '../../messages/en.json';

const route = vi.hoisted(() => ({ pathname: '/explore' }));
afterEach(() => { route.pathname = '/explore'; });

vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    onClick,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props} onClick={event => { event.preventDefault(); onClick?.(event); }}>
      {children}
    </a>
  ),
  usePathname: () => route.pathname,
}));

vi.mock('@/components/layout/LanguageSwitcher', () => ({
  default: () => <button type="button">Language</button>,
}));

vi.mock('@/components/layout/NavbarAuth', () => ({
  default: () => <button type="button">Sign in</button>,
}));

vi.mock('@/components/layout/LayoutContext', () => ({
  useLayout: () => ({ config: { navbarTransparent: false } }),
}));

function renderNavbar() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <Navbar />
    </NextIntlClientProvider>,
  );
}

describe('Navbar desktop alignment', () => {
  it('anchors the brand group left and the navigation actions right across the full width', () => {
    renderNavbar();

    const layout = screen.getByTestId('navbar-layout');
    expect(layout.className).toContain('w-full');
    expect(layout.className).not.toContain('container');
    expect(layout.className).not.toContain('mx-auto');

    const brandGroup = screen.getByTestId('navbar-brand-group');
    expect(brandGroup.className).toContain('flex-1');
    expect(brandGroup.className).toContain('min-w-0');
    expect(brandGroup.className).toContain('text-left');

    const actions = screen.getByTestId('navbar-desktop-actions');
    expect(actions.className).toContain('ml-auto');
    expect(actions.className).toContain('shrink-0');
    expect(actions.className).toContain('justify-end');
    expect(actions.className).toContain('lg:flex');
    expect(actions.className).not.toContain('md:flex');

    const mobileActions = screen.getByTestId('navbar-mobile-actions');
    expect(mobileActions.className).toContain('lg:hidden');
    expect(mobileActions.className).not.toContain('md:hidden');
  });

  it('uses a larger, truncation-safe tagline in the desktop navbar', () => {
    renderNavbar();

    const tagline = screen.getAllByText(enMessages.common.nav.tagline)[0];
    expect(tagline.className).toContain('text-sm');
    expect(tagline.className).toContain('min-w-0');
    expect(tagline.className).toContain('truncate');
  });

  it('dismisses the mobile menu on route commit, not before an outgoing navigation', async () => {
    const { rerender } = renderNavbar();
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('link', { name: 'Gallery', exact: true }));
    expect(dialog).toBeVisible();
    route.pathname = '/gallery';
    rerender(<NextIntlClientProvider locale="en" messages={enMessages}><Navbar /></NextIntlClientProvider>);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    route.pathname = '/explore';
    rerender(<NextIntlClientProvider locale="en" messages={enMessages}><Navbar /></NextIntlClientProvider>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Explore', exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
