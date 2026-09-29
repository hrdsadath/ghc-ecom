const vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined;

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || vercelProductionUrl || 'http://localhost:3000').replace(/\/+$/, '');

export const absoluteUrl = (path = '/') => new URL(path, `${SITE_URL}/`).toString();

export const STORE = {
    name: 'Glockery Home Centre',
    shortName: 'Glockery',
    tagline: 'Crockery & Kitchenware',
    description: 'Glockery Home Centre is a crockery and kitchenware shop in Vengara, Malappuram, Kerala. Shop dinner sets, tea sets, cups, serving dishes, canisters, trays, oil and vinegar sets, cutlery and kitchen essentials online or in store.',
    phone: '+91 8138003232',
    whatsapp: '+91 6282000289',
    whatsappUrl: 'https://wa.me/916282000289',
    instagram: 'https://www.instagram.com/glockery_home_centre/',
    address: {
        streetAddress: 'Home Centre, Near ICICI Bank',
        addressLocality: 'Vengara',
        addressRegion: 'Kerala',
        postalCode: '676304',
        addressCountry: 'IN',
    },
    currency: 'INR',
    keywords: [
        'crockery shop Vengara',
        'kitchenware Malappuram',
        'dinner sets Kerala',
        'tea sets online India',
        'serving dishes',
        'canister sets',
        'cutlery sets',
        'home centre Vengara',
    ],
} as const;

export const STORE_ID = `${SITE_URL}/#store`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

/** Routes that hold personal or transactional data and must stay out of search and AI indexes. */
export const PRIVATE_PATHS = [
    '/admin',
    '/account',
    '/auth',
    '/cart',
    '/checkout',
    '/order-confirmation',
    '/order-lookup',
    '/tracking',
    '/wishlist',
    '/api/',
];

/** Trims copy to a search-snippet length on a word boundary. */
export const metaDescription = (text: string | null | undefined, fallback: string, max = 158) => {
    const clean = (text || fallback).replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max - 1);
    return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,.;:\s]+$/, '')}…`;
};
