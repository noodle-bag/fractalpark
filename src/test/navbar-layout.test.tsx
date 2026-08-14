import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import Navbar from '@/components/layout/Navbar';
import enMessages from '../../messages/en.json';

vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => '/explore',
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
});
