import { Category, Product } from '../types';
import { STORE, STORE_ID, WEBSITE_ID, SITE_URL, absoluteUrl } from './site';

type Schema = Record<string, unknown>;

export const serializeJsonLd = (value: unknown): string =>
    JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');

const postalAddress = { '@type': 'PostalAddress', ...STORE.address };

export const storeSchema = (): Schema => ({
    '@type': ['HomeGoodsStore', 'OnlineStore'],
    '@id': STORE_ID,
    name: STORE.name,
    alternateName: STORE.shortName,
    description: STORE.description,
    url: absoluteUrl('/'),
    logo: absoluteUrl('/icon.png'),
    image: absoluteUrl('/opengraph-image'),
    telephone: STORE.phone,
    address: postalAddress,
    currenciesAccepted: STORE.currency,
    paymentAccepted: 'Card, UPI',
    sameAs: [STORE.instagram],
    contactPoint: [
        { '@type': 'ContactPoint', contactType: 'customer service', telephone: STORE.phone, areaServed: 'IN' },
        { '@type': 'ContactPoint', contactType: 'sales', telephone: STORE.whatsapp, areaServed: 'IN', description: 'WhatsApp' },
    ],
});

export const websiteSchema = (): Schema => ({
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: STORE.name,
    url: absoluteUrl('/'),
    inLanguage: 'en-IN',
    publisher: { '@id': STORE_ID },
    potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
    },
});

export const breadcrumbSchema = (items: Array<{ name: string; path: string }>): Schema => ({
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        item: absoluteUrl(item.path),
    })),
});

const rupeeAmount = (paise: number) => (paise / 100).toFixed(2);

export const productSchema = (product: Product): Schema => {
    const url = absoluteUrl(`/product/${product.slug}`);
    const variants = product.variants.filter((variant) => variant.isActive !== false);
    const prices = variants.map((variant) => variant.pricePaise);
    const inStock = variants.some((variant) => variant.availableStock > 0);
    const availability = `https://schema.org/${inStock ? 'InStock' : 'OutOfStock'}`;
    const seller = { '@id': STORE_ID };

    const offers = prices.length === 0 ? undefined : new Set(prices).size === 1
        ? {
            '@type': 'Offer',
            url,
            priceCurrency: STORE.currency,
            price: rupeeAmount(prices[0]),
            availability,
            itemCondition: 'https://schema.org/NewCondition',
            seller,
        }
        : {
            '@type': 'AggregateOffer',
            url,
            priceCurrency: STORE.currency,
            lowPrice: rupeeAmount(Math.min(...prices)),
            highPrice: rupeeAmount(Math.max(...prices)),
            offerCount: prices.length,
            availability,
            itemCondition: 'https://schema.org/NewCondition',
            seller,
        };

    return {
        '@type': 'Product',
        '@id': `${url}#product`,
        name: product.name,
        url,
        description: product.description || product.shortDescription || undefined,
        image: product.images.map((image) => image.largeUrl),
        sku: variants[0]?.sku,
        category: product.category?.name,
        material: product.material || undefined,
        brand: { '@type': 'Brand', name: STORE.name },
        offers,
    };
};

export const collectionSchema = (
    category: Pick<Category, 'name' | 'slug' | 'description'>,
    products: Product[],
    path: string,
): Schema => ({
    '@type': 'CollectionPage',
    name: `${category.name} collection`,
    description: category.description || undefined,
    url: absoluteUrl(path),
    isPartOf: { '@id': WEBSITE_ID },
    mainEntity: {
        '@type': 'ItemList',
        numberOfItems: products.length,
        itemListElement: products.map((product, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            url: absoluteUrl(`/product/${product.slug}`),
            name: product.name,
        })),
    },
});

export const faqSchema = (items: Array<{ title: string; body: string }>): Schema => ({
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
        '@type': 'Question',
        name: item.title,
        acceptedAnswer: { '@type': 'Answer', text: item.body },
    })),
});

/** Wraps one or more nodes in a single @graph document. */
export const jsonLdGraph = (...nodes: Schema[]) => ({ '@context': 'https://schema.org', '@graph': nodes });
