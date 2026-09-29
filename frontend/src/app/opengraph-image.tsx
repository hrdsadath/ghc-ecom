import { ImageResponse } from 'next/og';
import { STORE } from '../lib/site';

export const alt = 'Glockery Home Centre – crockery and kitchenware in Vengara, Malappuram';
export const size = { width: 1200, height: 630 };
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
          padding: '72px 80px',
          background: '#080807',
          color: '#f1ede4',
          border: '2px solid #c9a35b',
        }}
      >
        <div style={{ display: 'flex', fontSize: 30, letterSpacing: 12, color: '#c9a35b' }}>GLOCKERY</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 76, lineHeight: 1.05, fontWeight: 600 }}>Crockery and kitchenware</div>
          <div style={{ display: 'flex', fontSize: 76, lineHeight: 1.05, fontWeight: 600 }}>for every home.</div>
          <div style={{ display: 'flex', marginTop: 28, fontSize: 30, color: '#dbc184' }}>
            Dinner sets · Tea sets · Serving dishes · Canisters · Cutlery
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 26, color: 'rgba(241, 237, 228, 0.7)' }}>
          {STORE.name} · Vengara, Malappuram, Kerala
        </div>
      </div>
    ),
    size,
  );
}
