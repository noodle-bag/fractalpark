import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import {
  renderLegacyFormulaDirectoryGoneHtmlV1,
  resolveLegacyFormulaDirectoryStatusV1,
} from './lib/formula-directory-status';
import { isHeldFormulaRecordPathV1 } from './lib/held-formula-record-route';

// Disable the middleware's HTTP `Link` alternate headers: their x-default
// targets the unprefixed path (/explore, /drift), which is intentionally a
// 404 — unprefixed page paths no longer resolve. HTML-head alternates (owned
// by our metadata) already carry the correct x-default → /en/... mapping.
const intlMiddleware = createMiddleware({ ...routing, alternateLinks: false });

/**
 * Legacy entry points permanently moved to the canonical Explore landing.
 * `/` resolves through the default locale; `/en` and `/zh` keep their locale.
 * Served as an explicit HTTP 301 so Google, Bing, and Baidu all honor the
 * migration (302/307/308 are intentionally not used here).
 */
const LEGACY_ENTRY_TARGETS: Record<string, string> = {
  '/': `/${routing.defaultLocale}/explore`,
  ...Object.fromEntries(
    routing.locales.map((locale) => [`/${locale}`, `/${locale}/explore`])
  ),
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

  const directoryStatus = resolveLegacyFormulaDirectoryStatusV1(
    new URL(request.nextUrl.toString()),
  );
  if (directoryStatus.kind === 'redirect') {
    return NextResponse.redirect(directoryStatus.location, 301);
  }
  if (directoryStatus.kind === 'gone') {
    return new NextResponse(
      renderLegacyFormulaDirectoryGoneHtmlV1(directoryStatus.locale),
      {
        status: 410,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex, follow',
        },
      },
    );
  }
  if (directoryStatus.kind === 'not-found') {
    return new NextResponse(null, {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, follow',
      },
    });
  }

  const redirectTarget = LEGACY_ENTRY_TARGETS[request.nextUrl.pathname];
  if (redirectTarget) {
    // clone() preserves the original query string item-for-item.
    const target = request.nextUrl.clone();
    target.pathname = redirectTarget;
    return NextResponse.redirect(target, 301);
  }

  const response = intlMiddleware(request);
  if (isHeldFormulaRecordPathV1(request.nextUrl.pathname)) {
    response.headers.set('X-Robots-Tag', 'noindex, follow');
  }
  return response;
}

export const config = {
  // Only run on:
  // - Root path (301 to the default-locale Explore landing)
  // - Locale-prefixed paths (incl. the /en and /zh 301 entry points)
  // Skip: sitemap.xml, robots.txt, favicon.ico, api, _next static files, images
  matcher: [
    '/',
    '/(en|zh|pt|ko|ru|es|fr)/:path*',
    '/:path*.txt',
  ],
};
