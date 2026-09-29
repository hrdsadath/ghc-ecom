import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { connection } from 'next/server';
import '../index.css';
import Providers from './providers';
import JsonLd from '../components/JsonLd';
import { SITE_URL, STORE } from '../lib/site';
import { jsonLdGraph, storeSchema, websiteSchema } from '../lib/structured-data';

const defaultTitle = 'Glockery Home Centre Vengara | Crockery & Kitchenware';
const defaultDescription = 'Shop premium crockery, dinner sets, tea sets, serving dishes, canisters and kitchenware from Glockery Home Centre in Vengara, Malappuram.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: defaultTitle,
    template: '%s | Glockery Home Centre',
  },
  description: defaultDescription,
  applicationName: STORE.name,
  keywords: [...STORE.keywords],
  category: 'shopping',
  creator: STORE.name,
  publisher: STORE.name,
  formatDetection: { telephone: false, email: false, address: false },
  openGraph: {
    type: 'website',
    siteName: STORE.name,
    locale: 'en_IN',
    title: defaultTitle,
    description: defaultDescription,
  },
  twitter: {
    card: 'summary_large_image',
    title: defaultTitle,
    description: defaultDescription,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
      : undefined,
  },
  other: {
    'geo.region': 'IN-KL',
    'geo.placename': 'Vengara, Malappuram',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#080807',
};

const RouteFallback = () => (
  <div className="grid min-h-screen place-items-center bg-obsidian text-gold-300" role="status">
    <span className="text-xs uppercase tracking-[0.28em]">Loading Glockery…</span>
  </div>
);

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The CSP nonce from src/proxy.ts only reaches pages rendered per request, so no page may be
  // prerendered: a static page would ship un-nonced inline scripts that the browser blocks.
  await connection();

  return (
    <html lang="en-IN" data-scroll-behavior="smooth">
      <body>
        <JsonLd data={jsonLdGraph(storeSchema(), websiteSchema())} />
        <Suspense fallback={<RouteFallback />}>
          <Providers>{children}</Providers>
        </Suspense>
      </body>
    </html>
  );
}
