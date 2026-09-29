import 'server-only';
import { Category, PaginatedProducts, Product } from '../types';

const apiOrigin = () => {
  const configured = process.env.API_SERVER_URL || process.env.BACKEND_ORIGIN;
  const origin = configured || (process.env.NODE_ENV === 'production'
    ? 'https://ghc-ecom-production.up.railway.app'
    : 'http://127.0.0.1:3001');
  const normalized = origin.replace(/\/+$/, '');
  return normalized.endsWith('/api/v1') ? normalized : `${normalized}/api/v1`;
};

export class CatalogueApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'CatalogueApiError';
  }
}

async function catalogueFetch<T>(
  path: string,
  revalidate: number,
  tags: string[],
): Promise<T> {
  const response = await fetch(`${apiOrigin()}${path}`, {
    cache: 'force-cache',
    next: { revalidate, tags },
    headers: { accept: 'application/json' },
  });

  if (!response.ok) {
    throw new CatalogueApiError(`Catalogue request failed (${response.status})`, response.status);
  }

  return response.json() as Promise<T>;
}

export const getCachedCategories = () =>
  catalogueFetch<Category[]>('/categories', 300, ['catalogue', 'categories']);

export const getCachedProducts = (params: URLSearchParams) =>
  catalogueFetch<PaginatedProducts>(
    `/products?${params.toString()}`,
    60,
    ['catalogue', 'products'],
  );

export const getCachedProduct = (slug: string) =>
  catalogueFetch<Product>(
    `/products/${encodeURIComponent(slug)}`,
    120,
    ['catalogue', 'products', `product:${slug}`],
  );

const MAX_LISTING_PAGES = 20;

/** Every published product (card fields only), for sitemaps and llms.txt. */
export async function getAllCachedProducts() {
  const products = [];
  for (let page = 1; page <= MAX_LISTING_PAGES; page += 1) {
    const result = await getCachedProducts(new URLSearchParams({ page: String(page), limit: '100' }));
    products.push(...result.items);
    if (products.length >= result.total || result.items.length === 0) break;
  }
  return products;
}
