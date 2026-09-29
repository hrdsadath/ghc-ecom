import type { MetadataRoute } from 'next';
import { STORE } from '../lib/site';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: STORE.name,
    short_name: STORE.shortName,
    description: STORE.description,
    start_url: '/',
    display: 'standalone',
    background_color: '#080807',
    theme_color: '#080807',
    lang: 'en-IN',
    categories: ['shopping', 'lifestyle'],
    icons: [
      { src: '/icon.png', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
