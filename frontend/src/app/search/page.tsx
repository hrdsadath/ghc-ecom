import type { Metadata } from 'next';
import SearchPage from '../../views/search';

interface PageProps {
  searchParams: Promise<{ q?: string | string[] }>;
}

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

export default SearchPage;
