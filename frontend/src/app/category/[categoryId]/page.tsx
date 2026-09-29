import type { Metadata } from 'next';
import CategoryPage from '../../../views/category';
import JsonLd from '../../../components/JsonLd';
import { getCachedCategories, getCachedProducts } from '../../../lib/server-catalogue';
import { titleCase } from '../../../lib/commerce';
import { STORE, metaDescription } from '../../../lib/site';
import { breadcrumbSchema, collectionSchema, jsonLdGraph } from '../../../lib/structured-data';

export const revalidate = 0;

interface PageProps {
  params: Promise<{ categoryId: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}

const pageNumber = (value?: string | string[]) => {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
};

/** Resolves the published category; `null` means the list loaded and the slug is not in it. */
async function categoryForSlug(slug: string) {
  const categories = await getCachedCategories().catch(() => undefined);
  if (!categories) return undefined;
  return categories.find((category) => category.slug === slug) ?? null;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { categoryId } = await params;
  const page = pageNumber((await searchParams).page);
  const category = await categoryForSlug(categoryId);
  const name = category?.name || titleCase(categoryId.replace(/-/g, ' '));
  const path = `/category/${categoryId}${page > 1 ? `?page=${page}` : ''}`;
  const description = metaDescription(
    category?.description,
    `Shop ${name.toLowerCase()} online from ${STORE.name}, a crockery and kitchenware shop in Vengara, Malappuram. Check prices and order online.`,
  );

  return {
    title: `${name} collection${page > 1 ? ` – page ${page}` : ''}`,
    description,
    alternates: { canonical: path },
    openGraph: { title: `${name} | ${STORE.name}`, description, url: path },
    ...(category === null ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function Page({ params, searchParams }: PageProps) {
  const { categoryId } = await params;
  const query = await searchParams;
  const page = pageNumber(query.page);
  const requestParams = new URLSearchParams({
    page: String(page),
    limit: '24',
    category: categoryId,
  });
  const [initialData, category] = await Promise.all([
    getCachedProducts(requestParams).catch(() => undefined),
    categoryForSlug(categoryId),
  ]);
  const name = category?.name || initialData?.items[0]?.category.name;
  const path = `/category/${categoryId}${page > 1 ? `?page=${page}` : ''}`;

  return (
    <>
      {name && initialData && (
        <JsonLd
          data={jsonLdGraph(
            collectionSchema({ name, slug: categoryId, description: category?.description }, initialData.items, path),
            breadcrumbSchema([
              { name: 'Home', path: '/' },
              { name, path: `/category/${categoryId}` },
            ]),
          )}
        />
      )}
      <CategoryPage
        initialCategoryId={categoryId}
        initialData={initialData}
        initialPage={page}
      />
    </>
  );
}
