import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../messages/en.json';

const replaceMock = vi.fn();
let mockPathname = '/explore';

vi.mock('@/i18n/routing', () => ({
  routing: { locales: ['en', 'zh'], defaultLocale: 'en' },
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: replaceMock }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import LanguageSwitcher from '@/components/layout/LanguageSwitcher';

function renderSwitcher(): void {
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <LanguageSwitcher />
    </NextIntlClientProvider>,
  );
}

function setLocation(search: string, hash: string): void {
  window.history.pushState({}, '', `/en/explore${search}${hash}`);
}

beforeEach(() => {
  replaceMock.mockClear();
  mockPathname = '/explore';
  setLocation('?draft=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee&view=mine', '#section-2');
});

describe('LanguageSwitcher (v0.4.16 data-driven dropdown)', () => {
  it('preserves path, query, and hash when switching locale', async () => {
    renderSwitcher();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Language' }), { button: 0 });
    fireEvent.click(await screen.findByText('中文'));
    expect(replaceMock).toHaveBeenCalledTimes(1);
    const [href, options] = replaceMock.mock.calls[0] as [string, { locale: string }];
    expect(href).toBe('/explore?draft=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee&view=mine#section-2');
    expect(options.locale).toBe('zh');
  });

  it('shows the current locale with a visible selected state', async () => {
    renderSwitcher();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Language' }), { button: 0 });
    const current = await screen.findByText('English');
    expect(current.closest('[aria-current="true"]')).toBeTruthy();
  });

  it('selecting the current locale is a no-op', async () => {
    renderSwitcher();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Language' }), { button: 0 });
    fireEvent.click(await screen.findByText('English'));
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('works without a query string', async () => {
    setLocation('', '');
    renderSwitcher();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Language' }), { button: 0 });
    fireEvent.click(await screen.findByText('中文'));
    const [href] = replaceMock.mock.calls[0] as [string, { locale: string }];
    expect(href).toBe('/explore');
  });
});
