import { getAllCachedProducts, getCachedCategories } from '../../lib/server-catalogue';
import { rupees } from '../../lib/commerce';
import { pageContent } from '../../lib/info-content';
import { STORE, absoluteUrl } from '../../lib/site';
import { Product } from '../../types';

// A plain-text guide for AI assistants and answer engines (https://llmstxt.org).
export const revalidate = 3600;

const priceRange = (product: Product) => {
  const prices = product.variants.map((variant) => variant.pricePaise);
  if (prices.length === 0) return '';
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  return low === high ? rupees(low) : `${rupees(low)}–${rupees(high)}`;
};

const oneLine = (text?: string | null) => (text || '').replace(/\s+/g, ' ').trim();

export async function GET() {
  const [categories, products] = await Promise.all([
    getCachedCategories().catch(() => []),
    getAllCachedProducts().catch(() => []),
  ]);
  const { streetAddress, addressLocality, addressRegion, postalCode } = STORE.address;

  const lines = [
    `# ${STORE.name}`,
    '',
    `> ${STORE.description}`,
    '',
    '## Store facts',
    '',
    `- Address: ${streetAddress}, ${addressLocality}, Malappuram, ${addressRegion} ${postalCode}, India`,
    `- Phone: ${STORE.phone}`,
    `- WhatsApp: ${STORE.whatsapp} (${STORE.whatsappUrl})`,
    `- Instagram: ${STORE.instagram}`,
    '- Currency: Indian rupees (INR). Online payments are taken on the HDFC Bank SmartGateway secure payment page.',
    '- Stock: customers can confirm current stock and product details on WhatsApp before ordering.',
    '',
    '## Key pages',
    '',
    `- [All products](${absoluteUrl('/search')}): the full online catalogue`,
    `- [About](${absoluteUrl('/about')}): ${pageContent.about.metaDesc}`,
    `- [FAQ](${absoluteUrl('/faq')}): ${pageContent.faq.metaDesc}`,
    `- [Contact](${absoluteUrl('/contact')}): ${pageContent.contact.metaDesc}`,
    `- [Orders and returns](${absoluteUrl('/shipping-returns')}): ${pageContent.shipping.metaDesc}`,
    '',
  ];

  if (categories.length) {
    lines.push('## Collections', '');
    for (const category of categories) {
      const description = oneLine(category.description);
      lines.push(`- [${category.name}](${absoluteUrl(`/category/${category.slug}`)})${description ? `: ${description}` : ''}`);
    }
    lines.push('');
  }

  if (products.length) {
    lines.push('## Products', '');
    for (const product of products) {
      const details = [product.category?.name, priceRange(product), oneLine(product.shortDescription)].filter(Boolean).join(' · ');
      lines.push(`- [${product.name}](${absoluteUrl(`/product/${product.slug}`)})${details ? `: ${details}` : ''}`);
    }
    lines.push('');
  }

  lines.push('## Frequently asked questions', '');
  for (const item of pageContent.faq.sections) {
    lines.push(`### ${item.title}`, '', item.body, '');
  }

  return new Response(lines.join('\n'), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
