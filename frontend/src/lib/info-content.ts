export type InfoPageKind = 'about' | 'shipping' | 'faq' | 'contact' | 'privacy' | 'terms';

interface SectionItem {
    title: string;
    body: string;
}

export const pageContent: Record<
    InfoPageKind,
    {
        eyebrow: string;
        title: string;
        metaTitle: string;
        metaDesc: string;
        intro: string;
        sections: SectionItem[];
    }
> = {
    about: {
        eyebrow: 'Vengara, Malappuram',
        title: 'Crockery and kitchenware for every home.',
        metaTitle: 'About Glockery Home Centre Vengara',
        metaDesc: 'Visit Glockery Home Centre near ICICI Bank in Vengara, Malappuram for crockery, kitchenware and home essentials.',
        intro: 'Glockery Home Centre is a crockery and kitchenware shop in Vengara, Malappuram. Shop in store or contact us for product and order support.',
        sections: [
            {
                title: 'Visit our Vengara store',
                body: 'Find us at Home Centre, near ICICI Bank, Vengara, Malappuram, Kerala 676304.',
            },
            {
                title: 'What you will find',
                body: 'Our collections include dinner sets, tea sets and cups, serving dishes, canister sets, trays, oil and vinegar sets, cutlery and other kitchen essentials.',
            },
            {
                title: 'Order support',
                body: 'Contact us on WhatsApp to confirm current stock, product details, and any help you need before placing an order.',
            },
            {
                title: 'Call or WhatsApp',
                body: 'Call 8138 003 232 or WhatsApp 6282 000 289 for product enquiries and orders.',
            },
        ],
    },
    shipping: {
        eyebrow: 'Order information',
        title: 'Order and return help from Glockery.',
        metaTitle: 'Order & Return Information | Glockery Home Centre Vengara',
        metaDesc: 'Read order and return-help information for Glockery Home Centre, Vengara.',
        intro: 'Use this page for help with an order, a product enquiry, or a return request.',
        sections: [
            {
                title: 'Before you order',
                body: 'Send us the product name or photo on WhatsApp. We will help confirm current stock and product details.',
            },
            {
                title: 'Order updates',
                body: 'For help with an existing order, contact 8138 003 232 or WhatsApp 6282 000 289 with your order number.',
            },
            {
                title: 'Shop in person',
                body: 'You can browse the collections at Glockery Home Centre, near ICICI Bank in Vengara, Malappuram.',
            },
            {
                title: 'Returns or damaged items',
                body: 'Please confirm the current return terms before ordering. If an item arrives damaged, contact us promptly with the order details and clear photos of the item and packaging.',
            },
        ],
    },
    faq: {
        eyebrow: 'Quick answers',
        title: 'Frequently asked questions',
        metaTitle: 'Frequently Asked Questions | Glockery Home Centre Vengara',
        metaDesc: 'Answers about Glockery Home Centre Vengara: store location, products, online payment, stock checks, order tracking, damaged items and contact details.',
        intro: 'Useful information about visiting the shop, browsing products and placing an order.',
        sections: [
            {
                title: 'What is Glockery Home Centre?',
                body: 'Glockery Home Centre is a crockery and kitchenware shop in Vengara, Malappuram, Kerala. You can shop in store or order online from this website.',
            },
            {
                title: 'Where is Glockery Home Centre?',
                body: 'The shop is at Home Centre, near ICICI Bank, Vengara, Malappuram, Kerala 676304.',
            },
            {
                title: 'What products do you sell?',
                body: 'The range includes dinner sets, tea sets, cups, serving dishes, canisters, trays, oil and vinegar sets, cutlery and other crockery and kitchenware.',
            },
            {
                title: 'Can I check stock before ordering?',
                body: 'Yes. Send the product name or a photo on WhatsApp to 6282 000 289 and we will confirm current stock and product details.',
            },
            {
                title: 'How do I pay for an online order?',
                body: 'Online orders are paid on the HDFC Bank SmartGateway secure payment page. Glockery does not ask you to enter card or UPI details directly on this website. Prices are shown in Indian rupees.',
            },
            {
                title: 'How do I track my order?',
                body: 'Sign in and open your order history to see shipping details and tracking events. You can also find an order using the reference from your confirmation email, such as GLK-1002.',
            },
            {
                title: 'What if my item arrives damaged?',
                body: 'Contact us promptly with your order number and clear photos of the item and packaging. Please confirm the current return terms before ordering.',
            },
            {
                title: 'Do product colours match the photos?',
                body: 'Colours and details can vary slightly between screens and batches. Message us on WhatsApp if you need to confirm a detail before ordering.',
            },
            {
                title: 'How do I get help with an order?',
                body: 'Contact us with your order number on WhatsApp or by phone. We can help with payment, product, and return queries.',
            },
            {
                title: 'How can I contact the shop?',
                body: 'Call 8138 003 232 or WhatsApp 6282 000 289. You can also follow @glockery_home_centre on Instagram for product updates.',
            },
        ],
    },
    contact: {
        eyebrow: 'Call, WhatsApp or visit',
        title: 'Contact Glockery Home Centre',
        metaTitle: 'Contact Glockery Home Centre Vengara',
        metaDesc: 'Call, WhatsApp or visit Glockery Home Centre near ICICI Bank in Vengara, Malappuram.',
        intro: 'Ask about products, stock or an existing order. Send us a WhatsApp message or visit the Vengara store.',
        sections: [
            {
                title: 'Call',
                body: '8138 003 232',
            },
            {
                title: 'WhatsApp',
                body: '6282 000 289',
            },
            {
                title: 'Visit the shop',
                body: 'Home Centre, near ICICI Bank, Vengara, Malappuram, Kerala 676304.',
            },
        ],
    },
    privacy: {
        eyebrow: 'Website information',
        title: 'Privacy policy',
        metaTitle: 'Privacy Policy | Glockery Home Centre',
        metaDesc: 'How Glockery Home Centre uses information supplied through customer accounts and online orders.',
        intro: 'This website uses the information you provide to manage your account and process orders.',
        sections: [
            {
                title: 'Information We Collect',
                body: 'The website collects details such as your name, contact address, email address and phone number when needed for accounts and orders.',
            },
            {
                title: 'Payments',
                body: 'Online payments are completed on the HDFC Bank SmartGateway secure payment page. Glockery does not ask you to enter card or UPI credentials directly into this website.',
            },
            {
                title: 'Service providers',
                body: 'Order information may be shared with the services needed to complete payment. Contact the shop if you have a question about your information.',
            },
        ],
    },
    terms: {
        eyebrow: 'Online orders',
        title: 'Terms and conditions',
        metaTitle: 'Terms & Conditions | Glockery Home Centre',
        metaDesc: 'Review terms of service, payment policies, pricing transparency, and order terms for Glockery Home Centre.',
        intro: 'Important information about product availability, pricing and online orders.',
        sections: [
            {
                title: 'Order Acceptance & Availability',
                body: 'An online order is accepted after payment is verified and the product is confirmed as available. If an ordered product is unavailable, the shop will contact you about the available resolution.',
            },
            {
                title: 'Pricing & Taxes',
                body: 'Prices are displayed in Indian rupees. Any discount applied by the online checkout is shown before payment.',
            },
            {
                title: 'Questions before ordering',
                body: 'Product colours and details can vary between screens and batches. Contact Glockery on WhatsApp if you need to confirm a product detail before ordering.',
            },
        ],
    },
};
