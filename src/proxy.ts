import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/') {
    return NextResponse.rewrite(new URL(`/${routing.defaultLocale}`, request.url));
  }

  return intlMiddleware(request);
}

export const config = {
  // Only run on:
  // - Root path (for redirect to default locale)
  // - Locale-prefixed paths
  // Skip: sitemap.xml, robots.txt, favicon.ico, api, _next static files, images
  matcher: [
    '/',
    '/(en|zh)/:path*',
  ],
};
