import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ProductDetailPage from '../../../views/product';
import JsonLd from '../../../components/JsonLd';
import { CatalogueApiError, getCachedProduct } from '../../../lib/server-catalogue';
import { STORE, metaDescription } from '../../../lib/site';
import { breadcrumbSchema, jsonLdGraph, productSchema } from '../../../lib/structured-data';

export const revalidate = 0;

interface PageProps {
  params: Promise<{ productId: string }>;
}

async function productForSlug(slug: string) {
  try {
    return await getCachedProduct(slug);
  } catch (error) {
    if (error instanceof CatalogueApiError && error.status === 404) notFound();
    return undefined;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { productId } = await params;
  const product = await productForSlug(productId);
  if (!product) return { title: 'Product unavailable', robots: { index: false, follow: false } };

  const path = `/product/${product.slug}`;
  const description = metaDescription(
    product.shortDescription || product.description,
    `Shop ${product.name} from the ${product.category.name} collection at ${STORE.name}, Vengara.`,
  );
  const images = product.images.slice(0, 4).map((image) => ({ url: image.largeUrl, alt: image.altText || product.name }));
  const prices = product.variants.map((variant) => variant.pricePaise);
  const inStock = product.variants.some((variant) => variant.availableStock > 0);

  return {
    title: `${product.name} – ${product.category.name}`,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'website', title: product.name, description, url: path, images },
    twitter: { card: 'summary_large_image', title: product.name, description, images: images.map((image) => image.url) },
    other: prices.length
      ? {
          'product:price:amount': (Math.min(...prices) / 100).toFixed(2),
          'product:price:currency': STORE.currency,
          'product:availability': inStock ? 'in stock' : 'out of stock',
          'product:condition': 'new',
        }
      : undefined,
  };
}

export default async function Page({ params }: PageProps) {
  const { productId } = await params;
  const product = await productForSlug(productId);
  return (
    <>
      {product && (
        <JsonLd
          data={jsonLdGraph(
            productSchema(product),
            breadcrumbSchema([
              { name: 'Home', path: '/' },
              { name: product.category.name, path: `/category/${product.category.slug}` },
              { name: product.name, path: `/product/${product.slug}` },
            ]),
          )}
        />
      )}
      <ProductDetailPage initialProduct={product} initialSlug={productId} />
    </>
  );
}
