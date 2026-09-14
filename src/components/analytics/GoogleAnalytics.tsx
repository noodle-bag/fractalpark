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
          // Explore query edits are not page navigations.
          gtag('config', '${measurementId}', {
            send_page_view: false,
            allow_google_signals: false,
            allow_ad_personalization_signals: false
          });
        `}
      </Script>
    </>
  );
}
