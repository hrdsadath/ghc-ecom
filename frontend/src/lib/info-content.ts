export type InfoPageKind = 'about' | 'shipping' | 'faq' | 'contact' | 'privacy' | 'terms';

export const COMPANY_NAME = 'IQSA Connect LLP';

interface SectionItem {
    title: string;
    body: string;
    list?: { ordered?: boolean; items: string[] };
    table?: { headers: string[]; rows: string[][] };
    note?: string;
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
        metaDesc: 'Visit Glockery Home Centre, operated by IQSA Connect LLP, near ICICI Bank in Vengara, Malappuram for crockery, kitchenware and home essentials.',
        intro: `Glockery Home Centre is a crockery and kitchenware shop in Vengara, Malappuram, operated by ${COMPANY_NAME}. Shop in store or contact us for product and order support.`,
        sections: [
            {
                title: 'Our company',
                body: `Glockery Home Centre and this online store are owned and operated by ${COMPANY_NAME}. For business enquiries, email iqsaconnectllp@gmail.com.`,
            },
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
        eyebrow: 'Delivery information',
        title: 'Shipping Policy',
        metaTitle: 'Shipping Policy | Glockery Home Centre',
        metaDesc: 'Order processing times, delivery timelines, transit damage and order tracking for Glockery Home Centre, operated by IQSA Connect LLP.',
        intro: `At Glockery Home Centre, operated by ${COMPANY_NAME}, we take extra care in packaging every order, especially delicate ceramics and cookware, to ensure your products reach you safely and securely.`,
        sections: [
            {
                title: '1. Order Processing Time',
                body: '',
                list: {
                    items: [
                        'All orders are processed within 1 to 2 business days.',
                        'Orders placed after 09:00 AM will be processed on the following business day.',
                        'Once your order is dispatched, you will receive a confirmation message with a tracking link.',
                    ],
                },
            },
            {
                title: '2. Shipping Charges & Delivery Timelines',
                body: 'Delivery times may vary slightly for remote or rural locations.',
                table: {
                    headers: ['Delivery Option', 'Estimated Delivery Time', 'Shipping Cost'],
                    rows: [['Standard Shipping', '3 to 7 Business Days', 'Calculated at checkout']],
                },
            },
            {
                title: '3. Transit Damage & Broken Items Policy (Ceramics & Delicate Goods)',
                body: 'We double-layer wrap all fragile ceramic items using sturdy boxes and cushioning. In the rare event that an item arrives broken or damaged during transit:',
                list: {
                    ordered: true,
                    items: [
                        'Report Period: Please notify us within 24 to 48 hours of package delivery.',
                        'Proof Required: An unboxing video recorded while opening the package.',
                        'Resolution: Upon verification, we will send a free replacement or issue a full refund / store credit immediately.',
                    ],
                },
                note: 'If the outer parcel appears severely tampered with or crushed upon delivery, please refuse the package from the courier and inform our customer support team right away.',
            },
            {
                title: '4. Order Shipped',
                body: 'Once your order has shipped, we will send you a confirmation email. Keep it and your order number for your records.',
            },
            {
                title: '5. Incorrect Address & Failed Deliveries',
                body: '',
                list: {
                    items: [
                        'Please verify your address and mobile number carefully at checkout.',
                        'If a package is returned to us due to an incorrect address, missing phone number, or repeated failed delivery attempts, additional re-shipping charges may apply to dispatch the order again.',
                    ],
                },
            },
            {
                title: '6. Customer Support',
                body: 'If you have any questions or concerns about your delivery, feel free to reach out to us:',
                list: {
                    items: [
                        'Email: iqsaconnectllp@gmail.com',
                        'Phone / WhatsApp: +91 6282 000 289',
                        'Support Hours: Monday to Saturday | 9:00 AM – 6:00 PM',
                    ],
                },
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
        metaDesc: 'How Glockery Home Centre, operated by IQSA Connect LLP, uses information supplied through customer accounts and online orders.',
        intro: `Glockery Home Centre is operated by ${COMPANY_NAME}. This website uses the information you provide to manage your account and process orders.`,
        sections: [
            {
                title: 'Who We Are',
                body: `This website and online store are operated by ${COMPANY_NAME}, trading as Glockery Home Centre, Vengara, Malappuram, Kerala 676304. References to "we", "us" or "Glockery" in this policy mean ${COMPANY_NAME}.`,
            },
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
                body: `Order information may be shared with the services needed to complete payment and delivery. Contact ${COMPANY_NAME} at iqsaconnectllp@gmail.com if you have a question about your information.`,
            },
        ],
    },
    terms: {
        eyebrow: 'Online orders',
        title: 'Terms and conditions',
        metaTitle: 'Terms & Conditions | Glockery Home Centre',
        metaDesc: 'Review terms of service, payment policies, pricing transparency, and order terms for Glockery Home Centre, operated by IQSA Connect LLP.',
        intro: `Glockery Home Centre is operated by ${COMPANY_NAME}. These terms cover product availability, pricing and online orders placed on this website.`,
        sections: [
            {
                title: 'About These Terms',
                body: `This website and online store are operated by ${COMPANY_NAME}, trading as Glockery Home Centre, Vengara, Malappuram, Kerala 676304. By placing an order on this website you enter into a contract of sale with ${COMPANY_NAME}.`,
            },
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
