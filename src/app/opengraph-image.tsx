import { ImageResponse } from 'next/og';
import { SITE } from '@/lib/site';

export const alt = `${SITE.name} fractal art preview`;
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          color: '#f8fafc',
          background:
            'radial-gradient(circle at 28% 36%, #22d3ee 0, #155e75 19%, transparent 38%), radial-gradient(circle at 72% 44%, #f97316 0, #7c2d12 15%, transparent 34%), linear-gradient(135deg, #020617 0%, #111827 52%, #0f172a 100%)',
        }}
      >
        <div style={{ fontSize: 34, letterSpacing: 2, color: '#a5f3fc' }}>
          FRACTAL ART EXPLORER
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 92, fontWeight: 800 }}>{SITE.name}</div>
          <div style={{ maxWidth: 860, fontSize: 36, lineHeight: 1.25, color: '#d1d5db' }}>
            Explore 94 fractal formulas with real-time WebGL rendering,
            custom formulas, gallery presets, and high-resolution export.
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 28, color: '#bae6fd' }}>
          <span>{SITE.domain}</span>
          <span>Explore. Create. Share.</span>
        </div>
      </div>
    ),
    size
  );
}
