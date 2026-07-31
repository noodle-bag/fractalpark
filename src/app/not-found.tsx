import { SITE } from '@/lib/site';

/**
 * Global not-found page for requests outside the locale tree (unknown preset
 * shortlinks, unmatched paths). The root layout is a pass-through, so this
 * page renders its own <html> document. Locale-scoped 404s keep using the
 * localized layout instead.
 */
export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
          background: '#0a0a0a',
          color: '#f5f5f5',
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <main style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: '#a3a3a3', letterSpacing: '0.2em' }}>404</p>
          <h1 style={{ fontSize: '1.5rem', margin: '0.5rem 0 1rem' }}>
            This page drifted off the map.
          </h1>
          <p style={{ color: '#a3a3a3', marginBottom: '1.5rem' }}>
            The link may be outdated or the preset ID may not exist.
          </p>
          <a
            href={`${SITE.url}/en/explore`}
            style={{ color: '#7dd3fc', textDecoration: 'underline' }}
          >
            Open {SITE.name} Explore
          </a>
        </main>
      </body>
    </html>
  );
}
