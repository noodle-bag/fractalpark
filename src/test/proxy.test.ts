import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import proxy from '@/proxy';

/**
 * Proxy (middleware) tests — legacy entry points migrate to the canonical
 * Explore landing with an explicit HTTP 301, preserving the query string
 * item-for-item. Everything else falls through to the intl middleware.
 */

function requestFor(url: string): NextRequest {
  return new NextRequest(new URL(url, 'https://www.fractalpark.com'));
}

describe('proxy legacy entry redirects', () => {
  it('redirects / to the default-locale Explore landing with HTTP 301', () => {
    const response = proxy(requestFor('https://www.fractalpark.com/'));
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(
      'https://www.fractalpark.com/en/explore'
    );
  });

  it('redirects /en and /zh to their own locale Explore landing', () => {
    const en = proxy(requestFor('https://www.fractalpark.com/en'));
    expect(en.status).toBe(301);
    expect(en.headers.get('location')).toBe(
      'https://www.fractalpark.com/en/explore'
    );

    const zh = proxy(requestFor('https://www.fractalpark.com/zh'));
    expect(zh.status).toBe(301);
    expect(zh.headers.get('location')).toBe(
      'https://www.fractalpark.com/zh/explore'
    );
  });

  it('preserves the query string item-for-item', () => {
    const response = proxy(
      requestFor('https://www.fractalpark.com/?fm=newton3&z=12.5&julia=1')
    );
    expect(response.status).toBe(301);
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/en/explore');
    expect(location.searchParams.get('fm')).toBe('newton3');
    expect(location.searchParams.get('z')).toBe('12.5');
    expect(location.searchParams.get('julia')).toBe('1');

    const zhResponse = proxy(
      requestFor('https://www.fractalpark.com/zh?fm=lambda&pal=2')
    );
    const zhLocation = new URL(zhResponse.headers.get('location')!);
    expect(zhLocation.pathname).toBe('/zh/explore');
    expect(zhLocation.searchParams.get('fm')).toBe('lambda');
  });

  it('does not 301 canonical or content routes', () => {
    for (const path of ['/en/explore', '/zh/explore', '/en/drift', '/en/formulas']) {
      const response = proxy(requestFor(`https://www.fractalpark.com${path}`));
      expect(response.status, path).not.toBe(301);
    }
  });

  it('leaves .txt assets (llms.txt, IndexNow key) alone', () => {
    const response = proxy(requestFor('https://www.fractalpark.com/llms.txt'));
    expect(response.status).not.toBe(301);
  });
});
