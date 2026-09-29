import type { Metadata } from 'next';
import HomePage from '../views';
import { getCachedCategories, getCachedProducts } from '../lib/server-catalogue';

// Render the route on each request while preserving the explicit catalogue fetch cache.
export const revalidate = 0;

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: { url: '/' },
};

export default async function Page() {
  const [categories, products] = await Promise.allSettled([
    getCachedCategories(),
    getCachedProducts(new URLSearchParams({ page: '1', limit: '8' })),
  ]);

  return (
    <HomePage
      initialCategories={categories.status === 'fulfilled' ? categories.value : undefined}
      initialProducts={products.status === 'fulfilled' ? products.value.items : undefined}
    />
  );
}
