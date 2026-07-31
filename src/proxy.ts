import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

/**
 * Legacy entry points permanently moved to the canonical Explore landing.
 * `/` resolves through the default locale; `/en` and `/zh` keep their locale.
 * Served as an explicit HTTP 301 so Google, Bing, and Baidu all honor the
 * migration (302/307/308 are intentionally not used here).
 */
const LEGACY_ENTRY_TARGETS: Record<string, string> = {
  '/': `/${routing.defaultLocale}/explore`,
  '/en': '/en/explore',
  '/zh': '/zh/explore',
};

export default function proxy(request: NextRequest) {
  const indexNowKey = process.env.INDEXNOW_KEY;
  if (indexNowKey && request.nextUrl.pathname === `/${indexNowKey}.txt`) {
    return new NextResponse(indexNowKey, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  if (request.nextUrl.pathname.endsWith('.txt')) {
    return NextResponse.next();
  }

  const redirectTarget = LEGACY_ENTRY_TARGETS[request.nextUrl.pathname];
  if (redirectTarget) {
    // clone() preserves the original query string item-for-item.
    const target = request.nextUrl.clone();
    target.pathname = redirectTarget;
    return NextResponse.redirect(target, 301);
  }

  return intlMiddleware(request);
}

export const config = {
  // Only run on:
  // - Root path (301 to the default-locale Explore landing)
  // - Locale-prefixed paths (incl. the /en and /zh 301 entry points)
  // Skip: sitemap.xml, robots.txt, favicon.ico, api, _next static files, images
  matcher: [
    '/',
    '/(en|zh)/:path*',
    '/:path*.txt',
  ],
};
