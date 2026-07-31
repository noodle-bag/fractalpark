import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { SITE } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  verification: {
    other: {
      'baidu-site-verification': 'codeva-oDeAJImLT1',
    },
  },
};

/**
 * Root layout — pass-through shell.
 *
 * The real document (<html lang> + <body>) is rendered by
 * src/app/[locale]/layout.tsx so the lang attribute is localized in the
 * initial server HTML (`en` / `zh-CN`). Routes outside the locale tree
 * (preset shortlinks, not-found, global-error) render or redirect without a
 * document of their own, or bring their own <html> element.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
