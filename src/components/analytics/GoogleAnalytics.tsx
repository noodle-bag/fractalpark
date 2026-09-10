import { GoogleAnalyticsLoader } from './GoogleAnalyticsLoader';

type GoogleAnalyticsProps = {
  measurementId?: string;
};

export function GoogleAnalytics({
  measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
}: GoogleAnalyticsProps) {
  if (!measurementId) {
    return null;
  }

  const serializedMeasurementId = JSON.stringify(measurementId);

  return (
    <>
      <script
        id="google-analytics-bootstrap"
        dangerouslySetInnerHTML={{
          __html: `(function(){
            var measurementId=${serializedMeasurementId};
            window.dataLayer=window.dataLayer||[];
            window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};
            var granted=false;
            try { granted=localStorage.getItem('fractalpark.analytics.consent.v1')==='granted'; } catch (_) {}
            window.__fractalparkAnalyticsConsent=granted;
            window.__fractalparkConfigureAnalytics=function(){
              if(window.__fractalparkAnalyticsConfigured||!window.__fractalparkAnalyticsConsent)return;
              window.__fractalparkAnalyticsConfigured=true;
              var trafficClass='external';
              if(navigator.webdriver){trafficClass='automation';}
              else if(!['fractalpark.com','www.fractalpark.com'].includes(location.hostname)){trafficClass='development';}
              else { try { if(localStorage.getItem('fractalpark.analytics.traffic-class')==='internal'){trafficClass='internal';} } catch (_) {} }
              window.gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
              window.gtag('js',new Date());
              window.gtag('set',{traffic_type:trafficClass==='external'?'external':'internal',traffic_class:trafficClass});
              window.gtag('config',measurementId,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false});
            };
            if(granted)window.__fractalparkConfigureAnalytics();
          })();`,
        }}
      />
      <GoogleAnalyticsLoader measurementId={measurementId} />
    </>
  );
}
