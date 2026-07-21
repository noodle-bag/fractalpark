import Script from 'next/script';

type GoogleAnalyticsProps = {
  measurementId?: string;
};

export function GoogleAnalytics({
  measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
}: GoogleAnalyticsProps) {
  if (!measurementId) {
    return null;
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){window.dataLayer.push(arguments);}
          gtag('js', new Date());
          // send_page_view: false — 禁用自动 page_view，改由 PageViewTracker 手动发送
          // 原因：explore 页每次参数变化都会 router.replace 更新 URL，
          // 默认配置会把每次 URL 变化记为 page_view，导致 74 pv/session 的埋点污染
          gtag('config', '${measurementId}', {
            send_page_view: false
          });
        `}
      </Script>
    </>
  );
}
