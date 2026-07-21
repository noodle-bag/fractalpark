'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * 手动发送 page_view，只在 pathname（不含 query）变化时触发。
 *
 * 修复 GA4 埋点污染：explore 页每次参数变化都 router.replace 更新 URL，
 * 默认 gtag config 会对每次 URL 变化发 page_view，导致一次会话产生 50-100 次
 * 虚假 page_view（74 pv/session）。改为只在真实页面切换时发送。
 */
export function PageViewTracker() {
  const pathname = usePathname();
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    // 去掉 query string，只比较路径部分
    const path = pathname?.split('?')[0] ?? '';
    if (path && path !== lastPathRef.current) {
      lastPathRef.current = path;
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'page_view', {
          page_path: path,
          page_location: window.location.origin + path,
        });
      }
    }
  }, [pathname]);

  return null;
}

/**
 * 发送自定义交互事件（导出、保存、切换公式等）。
 * 用法：在交互处理函数里调用 trackEvent('export_png', { format: 'png' })
 */
export function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean>
) {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', eventName, params);
  }
}
