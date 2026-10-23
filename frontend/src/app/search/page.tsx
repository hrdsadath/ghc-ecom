import type { Metadata } from 'next';
import SearchPage from '../../views/search';
import { getCachedCategories, getCachedProducts } from '../../lib/server-catalogue';
import { positivePage, searchRequestParams } from '../../lib/search-params';

interface PageProps {
  searchParams: Promise<{ q?: string | string[]; category?: string | string[]; page?: string | string[] }>;
}

const first = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q)?.trim();
  if (query) {
    // Result pages for arbitrary queries are thin duplicates of the catalogue: let crawlers follow, not index.
    return { title: `Search: ${query}`, robots: { index: false, follow: true } };
  }
  return {
    title: 'All products',
    description: 'Browse every crockery and kitchenware product from Glockery Home Centre, Vengara: dinner sets, tea sets, serving dishes, canisters, cutlery and more.',
    alternates: { canonical: '/search' },
  };
}

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = first(params.q)?.trim() || '';
  const request = searchRequestParams(query, first(params.category) || '', positivePage(first(params.page)));
  // Browsing pages render with products; free-text queries stay client-fetched so arbitrary
  // search terms do not fill the shared catalogue cache.
  const [products, categories] = await Promise.all([
    query ? undefined : getCachedProducts(request).catch(() => undefined),
    getCachedCategories().catch(() => undefined),
  ]);

  return (
    <SearchPage
      initialData={products}
      initialRequest={products ? request.toString() : undefined}
      initialCategories={categories}
    />
  );
}
