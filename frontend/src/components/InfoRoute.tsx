import type { Metadata } from 'next';
import InfoPage from '../views/info';
import JsonLd from './JsonLd';
import { InfoPageKind, pageContent } from '../lib/info-content';
import { STORE_ID, WEBSITE_ID, absoluteUrl } from '../lib/site';
import { breadcrumbSchema, faqSchema, jsonLdGraph } from '../lib/structured-data';

export const infoPaths: Record<InfoPageKind, string> = {
    about: '/about',
    shipping: '/shipping-returns',
    faq: '/faq',
    contact: '/contact',
    privacy: '/privacy',
    terms: '/terms',
};

const pageTypes: Record<InfoPageKind, string> = {
    about: 'AboutPage',
    shipping: 'WebPage',
    faq: 'FAQPage',
    contact: 'ContactPage',
    privacy: 'WebPage',
    terms: 'WebPage',
};

export const infoMetadata = (kind: InfoPageKind): Metadata => {
    const page = pageContent[kind];
    const path = infoPaths[kind];
    return {
        title: { absolute: page.metaTitle },
        description: page.metaDesc,
        alternates: { canonical: path },
        openGraph: { title: page.metaTitle, description: page.metaDesc, url: path },
    };
};

const InfoRoute = ({ kind }: { kind: InfoPageKind }) => {
    const page = pageContent[kind];
    const path = infoPaths[kind];
    const webPage = {
        '@type': pageTypes[kind],
        '@id': `${absoluteUrl(path)}#webpage`,
        name: page.metaTitle,
        description: page.metaDesc,
        url: absoluteUrl(path),
        isPartOf: { '@id': WEBSITE_ID },
        inLanguage: 'en-IN',
        ...(kind === 'about' || kind === 'contact' ? { mainEntity: { '@id': STORE_ID } } : {}),
        ...(kind === 'faq' ? { mainEntity: faqSchema(page.sections).mainEntity } : {}),
    };

    return (
        <>
            <JsonLd data={jsonLdGraph(webPage, breadcrumbSchema([{ name: 'Home', path: '/' }, { name: page.title, path }]))} />
            <InfoPage kind={kind} />
        </>
    );
};

export default InfoRoute;
