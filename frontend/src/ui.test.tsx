import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import CartDrawer from './components/CartDrawer';
import Toast from './components/Toast';
import HomePage from './views';
import AccountPage from './views/account';
import AdminPage from './views/admin';
import AdminLoginPage from './views/admin-login';
import AuthPage from './views/auth';
import CartPage from './views/cart';
import ProductDetailPage from './views/product';
import { serializeJsonLd } from './lib/structured-data';
import { saveSession } from './lib/api';
import { catalogueCsvHeaders } from './lib/catalogue-csv';
import { Product } from './types';
import Providers from './app/providers';

const routerState = vi.hoisted(() => ({ path: '/' }));

vi.mock('next/navigation', () => ({
    usePathname: () => new URL(routerState.path, 'http://localhost').pathname,
    useSearchParams: () => new URL(routerState.path, 'http://localhost').searchParams,
    useParams: () => {
        const segments = new URL(routerState.path, 'http://localhost').pathname.split('/').filter(Boolean);
        return {
            productId: segments[0] === 'product' ? segments[1] : undefined,
            orderId: segments.includes('orders') || segments[0] === 'order-confirmation' ? segments.at(-1) : undefined,
            trackingNumber: segments[0] === 'tracking' ? segments[1] : undefined,
        };
    },
    useRouter: () => ({
        push: (href: string) => { routerState.path = href; },
        replace: (href: string) => { routerState.path = href; },
        back: vi.fn(),
    }),
    notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));

vi.mock('next/link', () => ({
    default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

vi.mock('next/image', () => ({
    default: ({ fill: _fill, priority: _priority, sizes: _sizes, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) => (
        <img {...props} />
    ),
}));

const product: Product = {
    id: '22222222-2222-4222-8222-222222222222',
    categoryId: '11111111-1111-4111-8111-111111111111',
    name: 'Noir Gold Serving Set',
    slug: 'noir-gold-serving-set',
    shortDescription: 'A dramatic serving set.',
    description: 'Gold-finished tableware for memorable evenings.',
    status: 'PUBLISHED',
    attributes: { material: 'Stainless steel' },
    category: {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Serveware',
        slug: 'serveware',
        isPublished: true,
        sortOrder: 0,
    },
    variants: [
        {
            id: '33333333-3333-4333-8333-333333333333',
            sku: 'GHC-NOIR-GOLD',
            pricePaise: 249900,
            attributes: { color: 'Gold', colorHex: '#C5A059' },
            isActive: true,
            availableStock: 8,
        },
        {
            id: '33333333-3333-4333-8333-333333333334',
            sku: 'GHC-NOIR-SAGE',
            pricePaise: 259900,
            attributes: { color: 'Sage Green', colorHex: '#9CAF88' },
            isActive: true,
            availableStock: 5,
        },
    ],
    images: [
        {
            id: '44444444-4444-4444-8444-444444444444',
            variantId: '33333333-3333-4333-8333-333333333333',
            thumbnailUrl: '/product.webp',
            mediumUrl: '/product.webp',
            largeUrl: '/product.webp',
            altText: 'Noir Gold Serving Set in Gold',
            sortOrder: 0,
        },
        {
            id: '44444444-4444-4444-8444-444444444445',
            variantId: '33333333-3333-4333-8333-333333333334',
            thumbnailUrl: '/sage.webp',
            mediumUrl: '/sage.webp',
            largeUrl: '/sage.webp',
            altText: 'Noir Gold Serving Set in Sage Green',
            sortOrder: 0,
        },
    ],
    videos: [
        {
            id: '55555555-5555-4555-8555-555555555556',
            url: 'https://cdn.example.com/noir-gold.mp4',
            altText: 'Noir Gold Serving Set video',
            sortOrder: 1,
        },
    ],
};

const emptyCart = {
    id: '55555555-5555-4555-8555-555555555555',
    status: 'ACTIVE',
    expiresAt: '2026-07-24T00:00:00.000Z',
    items: [],
    subtotalPaise: 0,
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
let mockAuthenticated = false;
let mockRoles: string[] = [];
let currentProduct = product;
let mockImportedProductFailure = false;
let mockDriveImageGate: Promise<void> | null = null;
let mockImageOrderFailure = false;

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (/\/admin\/catalogue\/products\/[^/]+\/images\/google-drive$/.test(url)) {
        if (mockDriveImageGate) await mockDriveImageGate;
        return json({ id: 'imported-image-id', url: 'https://images.example/catalogue.png' });
    }
    if (url.endsWith('/auth/csrf')) return json({ csrfToken: 'test-csrf-token' });
    if (url.endsWith('/auth/session')) {
        return mockAuthenticated
            ? json({
                  authenticated: true,
                  user: { id: 'user-1', email: 'admin@example.com' },
                  roles: mockRoles,
              })
            : json({ authenticated: false, user: null, roles: [] });
    }
    if (url.endsWith('/auth/refresh')) return json({ message: 'Session refresh is unavailable' }, 401);
    if (url.endsWith('/carts') && init?.method === 'POST') return json({ cart: emptyCart, guestToken: 'guest-token' });
    if (url.includes(`/carts/${emptyCart.id}/items`) && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as { variantId: string };
        const variant = product.variants.find((item) => item.id === body.variantId) || product.variants[0];
        const image = product.images.find((item) => item.variantId === variant.id);
        return json({
            ...emptyCart,
            items: [
                {
                    id: 'line-1',
                    variantId: variant.id,
                    sku: variant.sku,
                    productName: product.name,
                    color: typeof variant.attributes?.color === 'string' ? variant.attributes.color : null,
                    imageUrl: image?.thumbnailUrl,
                    quantity: 1,
                    unitPricePaise: variant.pricePaise,
                    lineTotalPaise: variant.pricePaise,
                },
            ],
            subtotalPaise: variant.pricePaise,
        });
    }
    if (url.endsWith('/admin/catalogue/categories') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { name: string };
        return json({
            id: 'new-category-id',
            name: body.name,
            slug: 'dinner-sets',
            isPublished: true,
            sortOrder: 0,
        });
    }
    if (url.endsWith('/categories')) return json([currentProduct.category]);
    if (url.includes('/products?')) return json({ items: [currentProduct], total: 1, page: 1, limit: 48 });
    if (url.endsWith(`/products/${product.slug}`)) return json(currentProduct);
    if (url.endsWith('/admin/inventory/levels')) {
        return json([
            {
                id: 'inventory-level-1',
                warehouseId: 'warehouse-1',
                variantId: product.variants[0].id,
                onHand: 8,
                reserved: 2,
                lowStockThreshold: 3,
                sku: product.variants[0].sku,
                alias: null,
                productId: product.id,
                productName: product.name,
                color: 'Gold',
                colorHex: '#C5A059',
                thumbnailUrl: '/product.webp',
                variantIsActive: true,
                warehouseCode: 'MAIN',
                warehouseName: 'Main Warehouse',
                warehouseIsActive: true,
            },
        ]);
    }
    if (url.endsWith('/admin/promotions/coupons') && (!init?.method || init.method === 'GET')) {
        return json([
            {
                id: 'coupon-1',
                code: 'WELCOME10',
                type: 'FIXED',
                value: 25_000,
                minimumSubtotalPaise: 100_000,
                maximumDiscountPaise: null,
                usageLimit: 100,
                perUserLimit: 1,
                startsAt: '2020-01-01T00:00:00.000+05:30',
                endsAt: '2020-01-31T23:59:59.999+05:30',
                isActive: true,
                createdAt: '2020-01-01T00:00:00.000Z',
                redemptionCount: 7,
            },
        ]);
    }
    if (/\/admin\/promotions\/coupons\/[^/]+$/.test(url) && init?.method === 'PATCH') {
        return json({ id: 'coupon-1', ...JSON.parse(String(init.body)) });
    }
    if (url.endsWith('/admin/inventory/warehouses')) {
        return json([{ id: 'warehouse-1', code: 'MAIN', name: 'Main Warehouse', isActive: true }]);
    }
    if (url.endsWith('/admin/catalogue/products/all')) return json([currentProduct]);
    if (/\/admin\/catalogue\/products\/[^/]+\/images\/order$/.test(url) && init?.method === 'PUT') {
        if (mockImageOrderFailure) return json({ message: 'The image order must list every image of this product exactly once.' }, 400);
        const { imageIds } = JSON.parse(String(init.body)) as { imageIds: string[] };
        return json(imageIds.map((id, sortOrder) => ({ ...currentProduct.images.find((image) => image.id === id), sortOrder })));
    }
    if (/\/admin\/catalogue\/products\/[^/]+$/.test(url) && init?.method === 'PATCH') {
        return json({ ...currentProduct, ...(JSON.parse(String(init.body)) as Partial<Product>), id: url.split('/').pop() });
    }
    if (/\/admin\/catalogue\/products\/[^/]+$/.test(url) && (!init?.method || init.method === 'GET')) {
        return json({ ...currentProduct, id: url.split('/').pop() });
    }
    if (/\/admin\/catalogue\/variants\/[^/]+$/.test(url) && init?.method === 'PATCH') {
        return json({ ...currentProduct.variants[0], ...(JSON.parse(String(init.body)) as object), id: url.split('/').pop() });
    }
    if (url.endsWith('/admin/catalogue/products') && init?.method === 'POST') {
        if (mockImportedProductFailure) return json({ message: 'Product save failed' }, 400);
        const body = JSON.parse(String(init.body)) as { categoryId: string; name: string; slug: string; status: Product['status'] };
        return json({
            ...currentProduct,
            id: 'new-product-id',
            categoryId: body.categoryId,
            name: body.name,
            slug: body.slug,
            status: body.status,
            variants: [],
            images: [],
            videos: [],
        });
    }
    if (/\/admin\/catalogue\/products\/[^/]+\/variants$/.test(url) && init?.method === 'POST') {
        return json({ ...currentProduct.variants[0], id: 'new-variant-id' });
    }
    if (/\/admin\/catalogue\/categories\/[^/]+$/.test(url) && init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
    }
    if (url.includes('/admin/audit-logs')) {
        return json({ nextCursor: null, items: [
            {
                id: 'audit-1',
                actorId: 'user-1',
                actorLabel: 'admin@example.com',
                action: 'catalogue.variant.updated',
                entityType: 'product_variant',
                entityId: product.variants[0].id,
                metadata: {
                    entityLabel: `${product.name} · ${product.variants[0].sku}`,
                    changes: {
                        pricePaise: { before: 249_900, after: 259_900 },
                        isActive: { before: true, after: false },
                    },
                },
                ipAddress: '127.0.0.1',
                createdAt: '2026-08-09T08:00:00.000Z',
            },
        ] });
    }
    if (url.endsWith('/admin/users') && (!init?.method || init.method === 'GET')) {
        return json([
            {
                id: 'user-1',
                email: 'admin@example.com',
                fullName: 'Faheem Admin',
                roles: ['ADMIN'],
                createdAt: '2026-07-01T08:00:00.000Z',
            },
            {
                id: 'staff-1',
                email: 'sana@example.com',
                fullName: 'Sana Khan',
                roles: ['SUPPORT_AGENT', 'CATALOGUE_MANAGER'],
                createdAt: '2026-08-01T08:00:00.000Z',
            },
        ]);
    }
    if (url.endsWith('/admin/catalogue/categories')) return json([currentProduct.category]);
    if (url.endsWith('/admin/catalogue/products')) return json([currentProduct]);
    if (url.includes('/admin/orders')) return json([], 403);
    if (url.includes('/admin/operations')) return json({}, 403);
    return json({});
});

let mountedRoot: Root | null = null;

const render = async (node: React.ReactNode, path = '/') => {
    routerState.path = path;
    window.history.replaceState(null, '', path);
    const container = document.createElement('div');
    document.body.appendChild(container);
    mountedRoot = createRoot(container);
    await act(async () => {
        mountedRoot!.render(
            <AuthProvider>
                <CartProvider>
                    {node}
                    <CartDrawer />
                    <Toast />
                </CartProvider>
            </AuthProvider>,
        );
        await Promise.resolve();
        await new Promise((resolve) => window.setTimeout(resolve, 220));
    });
    return container;
};

describe('black and gold commerce UI', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        mockAuthenticated = false;
        mockRoles = [];
        currentProduct = product;
        mockImportedProductFailure = false;
        mockDriveImageGate = null;
        mockImageOrderFailure = false;
        saveSession(null);
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockClear();
    });
    afterEach(() => {
        act(() => mountedRoot?.unmount());
        mountedRoot = null;
        document.body.innerHTML = '';
        vi.unstubAllGlobals();
    });

    it('renders the Vengara storefront from the catalogue API', async () => {
        const container = await render(<HomePage />);
        expect(container.textContent).toContain('Crockery and kitchenware for every home.');
        expect(container.textContent).toContain('Noir Gold Serving Set');
        expect(container.textContent).toContain('See what’s new in store');
        expect(container.textContent).toContain('Chat with Glockery on WhatsApp');
        expect(container.querySelectorAll('iframe[src*="instagram.com/reel/"]')).toHaveLength(5);
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/products?'), expect.anything());
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('limit=8'), expect.anything());
        expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/auth/refresh'), expect.anything());
    });

    it('removes Supabase signup credentials from the address bar', async () => {
        window.history.replaceState(
            null,
            '',
            '/#access_token=test-access-token&refresh_token=test-refresh-token&type=signup',
        );
        const container = document.createElement('div');
        document.body.appendChild(container);
        mountedRoot = createRoot(container);

        await act(async () => {
            mountedRoot!.render(<Providers><div>Storefront</div></Providers>);
            await Promise.resolve();
        });

        expect(window.location.hash).toBe('');
        expect(window.location.pathname).toBe('/');
    });

    it('leaves recovery credentials for the password-reset page to consume', async () => {
        const recoveryHash = '#access_token=test-access-token&refresh_token=test-refresh-token&type=recovery';
        window.history.replaceState(null, '', `/auth/reset-password${recoveryHash}`);
        const container = document.createElement('div');
        document.body.appendChild(container);
        mountedRoot = createRoot(container);

        await act(async () => {
            mountedRoot!.render(<Providers><div>Password reset</div></Providers>);
            await Promise.resolve();
        });

        expect(window.location.hash).toBe(recoveryHash);
    });

    it('uses a no-scrollbar horizontal thumbnail strip on mobile when more than four images are present', async () => {
        const galleryProduct: Product = {
            ...product,
            images: Array.from({ length: 6 }, (_, index) => ({
                id: `image-${index + 1}`,
                variantId: product.variants[0].id,
                thumbnailUrl: `/gallery-${index + 1}.webp`,
                mediumUrl: `/gallery-${index + 1}.webp`,
                largeUrl: `/gallery-${index + 1}.webp`,
                altText: `Gallery image ${index + 1}`,
                sortOrder: index,
            })),
        };
        currentProduct = galleryProduct;

        const container = await render(
            <ProductDetailPage />,
            `/product/${galleryProduct.slug}`,
        );

        const galleryStrip = container.querySelector('[data-product-gallery="thumbs"]');
        expect(galleryStrip).not.toBeNull();
        expect(galleryStrip?.className).toContain('overflow-x-auto');
        expect(galleryStrip?.className).toContain('no-scrollbar');
        expect(galleryStrip?.querySelectorAll('button')).toHaveLength(
            galleryProduct.images.length + galleryProduct.videos.length,
        );
        expect(galleryStrip?.querySelectorAll('button')[0]).toHaveProperty('type', 'button');
    });

    it('switches colour images and writes the selected variant to the backend cart', async () => {
        const container = await render(
            <ProductDetailPage />,
            `/product/${product.slug}`,
        );
        expect(container.textContent).toContain('₹2,499');
        const sageOption = container.querySelector<HTMLInputElement>(`input[value="${product.variants[1].id}"]`);
        await act(async () => {
            sageOption?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(container.querySelector<HTMLImageElement>('section img')?.getAttribute('src')).toBe('/sage.webp');
        expect(container.textContent).toContain('SKU GHC-NOIR-SAGE');
        expect(container.textContent).toContain('₹2,599');
        const videoThumbnail = container.querySelector<HTMLButtonElement>('button[aria-label="View video 2"]');
        await act(async () => {
            videoThumbnail?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(container.querySelector('video')).toBeNull();
        const playVideo = container.querySelector<HTMLButtonElement>('button[aria-label="Play Noir Gold Serving Set video"]');
        await act(async () => {
            playVideo?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(container.querySelector('video')).not.toBeNull();
        const add = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Add to cart'));
        await act(async () => {
            add?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining(`/carts/${emptyCart.id}/items`),
            expect.objectContaining({
                method: 'PUT',
                body: expect.stringContaining(product.variants[1].id),
            }),
        );
        expect(container.textContent).toContain('The bag');
    });

    it('disables buying when every product option is out of stock', async () => {
        const unavailableProduct: Product = {
            ...product,
            variants: product.variants.map((variant) => ({ ...variant, availableStock: 0 })),
        };
        currentProduct = unavailableProduct;
        const container = await render(
            <ProductDetailPage />,
            `/product/${product.slug}`,
        );

        const add = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Out of stock'));
        expect(add).toBeDefined();
        expect((add as HTMLButtonElement | undefined)?.disabled).toBe(true);
        expect(container.textContent).toContain('Out of stock — choose another option.');
    });

    it('renders an empty server-backed bag without demo products', async () => {
        const container = await render(<CartPage />, '/cart');
        expect(container.textContent).toContain('Nothing here—yet.');
        expect(container.textContent).toContain('Explore collection');
    });

    it('switches between sign-in and account registration', async () => {
        const container = await render(<AuthPage />, '/auth');
        const password = container.querySelector<HTMLInputElement>('#customer-password');
        const showPassword = container.querySelector<HTMLButtonElement>('button[aria-label="Show password"]');
        expect(password?.type).toBe('password');
        await act(async () => {
            showPassword?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(password?.type).toBe('text');
        expect(container.querySelector('button[aria-label="Hide password"]')).not.toBeNull();

        const register = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Create account');
        await act(async () => {
            register?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(container.textContent).toContain('Begin your collection.');
        expect(container.querySelector('input[name="name"]')).not.toBeNull();
        expect(password?.type).toBe('password');
    });

    it('protects customer account routes', async () => {
        const container = await render(
            <AccountPage />,
            '/account/orders',
        );
        expect(routerState.path).toBe('/auth?next=%2Faccount%2Forders');
    });

    it('renders a dedicated staff sign-in page', async () => {
        const container = await render(<AdminLoginPage />, '/admin/login');
        expect(container.textContent).toContain('Staff access');
        expect(container.textContent).toContain('Sign in to admin');
        expect(container.querySelector('input[name="email"]')).not.toBeNull();
        const password = container.querySelector<HTMLInputElement>('#admin-password');
        const showPassword = container.querySelector<HTMLButtonElement>('button[aria-label="Show password"]');
        expect(password?.type).toBe('password');
        await act(async () => {
            showPassword?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(password?.type).toBe('text');
        expect(container.querySelector('button[aria-label="Hide password"]')).not.toBeNull();
    });

    it('sends unauthenticated admin routes to the staff sign-in page', async () => {
        await render(<AdminPage />, '/admin/orders');
        expect(routerState.path).toBe('/admin/login?next=%2Fadmin%2Forders');
    });

    it('surfaces backend authorization failures in the admin console', async () => {
        mockAuthenticated = true;
        mockRoles = ['ADMIN'];
        const container = await render(<AdminPage />, '/admin');
        expect(container.textContent).toContain('Workspace / Overview');
        expect(container.textContent).toContain('Request failed');
        expect(container.querySelector('.admin-desktop-nav')?.className).toContain('lg:fixed');
        expect(container.querySelector('.admin-workspace-main')?.className).toContain('lg:ml-[264px]');
    });

    it('shows each inventory variant colour beside its SKU', async () => {
        mockAuthenticated = true;
        mockRoles = ['WAREHOUSE_MANAGER'];
        const container = await render(<AdminPage />, '/admin/inventory');

        expect(container.textContent).toContain('Noir Gold Serving Set');
        expect(container.textContent).toContain('GHC-NOIR-GOLD');
        expect(container.textContent).toContain('Gold');
        const swatch = container.querySelector<HTMLElement>('[aria-label="Gold colour swatch"]');
        expect(swatch).not.toBeNull();
        expect(swatch?.style.backgroundColor).toBe('rgb(197, 160, 89)');
        // Warehouse managers cannot read the catalogue, so the page must not depend on it.
        expect(fetchMock.mock.calls.some(([request]) => String(request).includes('/admin/catalogue/products'))).toBe(false);
    });

    it('shows coupon redemptions and edits money fields in rupees', async () => {
        mockAuthenticated = true;
        mockRoles = ['ADMIN'];
        const container = await render(<AdminPage />, '/admin/promotions');

        expect(container.textContent).toContain('WELCOME10');
        expect(container.textContent).toContain('7 / 100 used');
        expect(container.textContent).toContain('1 per customer');
        expect(container.textContent).toContain('Expired');
        const edit = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Edit');
        await act(async () => {
            edit?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(document.body.textContent).toContain('Edit WELCOME10');
        expect(document.body.textContent).toContain('Discount Amount (₹)');
        expect(document.body.querySelector<HTMLInputElement>('input[name="value"]')?.value).toBe('250');
        expect(document.body.querySelector<HTMLInputElement>('input[name="minimumSubtotal"]')?.value).toBe('1000');
        expect(document.body.querySelector<HTMLInputElement>('input[name="startsAt"]')?.value).toBe('2020-01-01');
        expect(document.body.querySelector<HTMLInputElement>('input[name="endsAt"]')?.value).toBe('2020-01-31');
    });

    it('keeps redundant variant-name and dimensions fields out of Add Product', async () => {
        mockAuthenticated = true;
        mockRoles = ['ADMIN'];
        const container = await render(<AdminPage />, '/admin/catalogue');
        const addProduct = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Add Product'));

        await act(async () => {
            addProduct?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(container.textContent).not.toContain('Catalogue Manager');
        expect(container.textContent).not.toContain('Option name');
        expect(container.querySelector('input[name="dimensions"]')).toBeNull();
        expect(document.body.textContent).toContain('SKU (unique, required)');
        expect(document.body.textContent).toContain('Alias name (optional)');
        const aliasInput = document.body.querySelector<HTMLInputElement>('input[placeholder="e.g. Sage green tea set"]');
        expect(aliasInput?.type).toBe('text');
        expect(aliasInput?.hasAttribute('required')).toBe(false);
        expect(aliasInput?.hasAttribute('pattern')).toBe(false);
    });

    it('keeps the product editor inside the viewport with independently scrolling content', async () => {
        mockAuthenticated = true;
        mockRoles = ['ADMIN'];
        const container = await render(<AdminPage />, '/admin/catalogue');
        const addProduct = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Add Product'));

        await act(async () => {
            addProduct?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const dialog = document.body.querySelector<HTMLElement>('[aria-labelledby="product-dialog-title"]');
        expect(dialog).not.toBeNull();
        expect(dialog?.closest('.admin-content')).toBeNull();
        expect(dialog?.className).toContain('max-h-[calc(100svh-1rem)]');
        expect(dialog?.className).toContain('overflow-hidden');
        expect(dialog?.querySelector('[data-dialog-scroll-body="product"]')?.className).toContain('overflow-y-auto');
        expect(dialog?.querySelector('[data-dialog-actions="product"]')?.className).toContain('shrink-0');
        expect(dialog?.querySelector('button[aria-label="Close product dialog"]')?.className).toContain('min-h-11');
    });

    it('shows categories by name without exposing their generated slug', async () => {
        mockAuthenticated = true;
        mockRoles = ['ADMIN'];
        const container = await render(<AdminPage />, '/admin/catalogue');
        const categoriesTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Categories'));

        await act(async () => {
            categoriesTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const headings = Array.from(container.querySelectorAll('th')).map((heading) => heading.textContent?.trim());
        expect(headings).toContain('Category Name');
        expect(headings).not.toContain('Slug');
        expect(container.textContent).not.toContain(currentProduct.category.slug);
    });

    it('creates a missing category by name during catalogue import', async () => {
        mockAuthenticated = true;
        mockRoles = ['ADMIN'];
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const container = await render(<AdminPage />, '/admin/catalogue');
        const values = ['Dinner Plate', 'Dinner Sets', 'DRAFT', '', '', 'Blue', '#0000FF', '', '', 'DINNER-PLATE', '', '999', '', 'TRUE', '', ''];
        const csv = `${catalogueCsvHeaders.join(',')}\n${values.join(',')}`;
        const file = { name: 'catalogue.csv', text: vi.fn().mockResolvedValue(csv) } as unknown as File;
        const input = container.querySelector<HTMLInputElement>('input[type="file"][accept*=".csv"]');
        Object.defineProperty(input, 'files', { configurable: true, value: [file] });

        await act(async () => {
            input?.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise((resolve) => window.setTimeout(resolve, 300));
        });

        const categoryRequest = fetchMock.mock.calls.find(([request, init]) =>
            String(request).endsWith('/admin/catalogue/categories') && init?.method === 'POST');
        expect(JSON.parse(String(categoryRequest?.[1]?.body))).toMatchObject({ name: 'Dinner Sets', isPublished: true });
        expect(String(categoryRequest?.[1]?.body)).not.toContain('slug');
        const productRequest = fetchMock.mock.calls.find(([request, init]) =>
            String(request).endsWith('/admin/catalogue/products') && init?.method === 'POST');
        expect(JSON.parse(String(productRequest?.[1]?.body))).toMatchObject({ categoryId: 'new-category-id' });
    });

    it('limits imported summaries and imports Drive images through the protected backend endpoint', async () => {
        mockAuthenticated = true;
        mockRoles = ['ADMIN'];
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const container = await render(<AdminPage />, '/admin/catalogue');
        const description = 'Long catalogue description. '.repeat(20);
        const driveUrl = 'https://drive.google.com/file/d/1ZnzuqyfO8OHUVdlToTsGxCEQSnX0atWy/view?usp=drive_link';
        const values = ['Client Drive Product', 'Serveware', 'DRAFT', description, 'Ceramic', 'Blue', '#0000FF', '', '', 'CLIENT-DRIVE-BLUE', '', '999', '', 'TRUE', driveUrl, ''];
        const csv = `${catalogueCsvHeaders.join(',')}\n${values.map((value) => `"${value.replace(/"/g, '""')}"`).join(',')}`;
        const file = { name: 'catalogue.csv', text: vi.fn().mockResolvedValue(csv) } as unknown as File;
        const input = container.querySelector<HTMLInputElement>('input[type="file"][accept*=".csv"]');
        Object.defineProperty(input, 'files', { configurable: true, value: [file] });

        await act(async () => {
            input?.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise((resolve) => window.setTimeout(resolve, 350));
        });

        const productRequest = fetchMock.mock.calls.find(([request, init]) =>
            String(request).endsWith('/admin/catalogue/products') && init?.method === 'POST');
        const productBody = JSON.parse(String(productRequest?.[1]?.body)) as { shortDescription: string };
        expect(productBody.shortDescription.length).toBeLessThanOrEqual(300);
        expect(fetchMock.mock.calls.some(([request, init]) =>
            /\/admin\/catalogue\/products\/[^/]+\/images\/google-drive$/.test(String(request)) &&
            init?.method === 'POST' &&
            String(init.body).includes(driveUrl))).toBe(true);
    });

    it('downloads a repeated option image once and reuses it across imported combinations', async () => {
        mockAuthenticated = true;
        mockRoles = ['ADMIN'];
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const container = await render(<AdminPage />, '/admin/catalogue');
        const driveUrl = 'https://drive.google.com/file/d/reused-image/view?usp=drive_link';
        const rows = [
            ['Reusable Image Set', 'Serveware', 'DRAFT', 'Description', 'Ceramic', 'Green', '#008000', 'Large', '1', 'REUSE-GREEN-L-1', '', '999', '', 'TRUE', driveUrl, ''],
            ['Reusable Image Set', 'Serveware', 'DRAFT', 'Description', 'Ceramic', 'Green', '#008000', 'Large', '2', 'REUSE-GREEN-L-2', '', '1799', '', 'TRUE', driveUrl, ''],
        ];
        const csv = `${catalogueCsvHeaders.join(',')}\n${rows.map((row) => row.map((value) => `"${value}"`).join(',')).join('\n')}`;
        const file = { name: 'reused-image.csv', text: vi.fn().mockResolvedValue(csv) } as unknown as File;
        const input = container.querySelector<HTMLInputElement>('input[type="file"][accept*=".csv"]');
        Object.defineProperty(input, 'files', { configurable: true, value: [file] });

        await act(async () => {
            input?.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise((resolve) => window.setTimeout(resolve, 450));
        });

        expect(fetchMock.mock.calls.filter(([request, init]) =>
            /\/admin\/catalogue\/products\/[^/]+\/images\/google-drive$/.test(String(request)) && init?.method === 'POST')).toHaveLength(1);
    });

    it('shows catalogue import progress in a modal until image processing finishes', async () => {
        mockAuthenticated = true;
        mockRoles = ['ADMIN'];
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        let releaseDriveImage: (() => void) | undefined;
        mockDriveImageGate = new Promise<void>((resolve) => {
            releaseDriveImage = resolve;
        });
        const container = await render(<AdminPage />, '/admin/catalogue');
        const driveUrl = 'https://drive.google.com/file/d/17Ek09Bk3NjFvdUgxTUtd4fjH94yYkis6/view?usp=drive_link';
        const values = ['Modal Import Product', 'Serveware', 'DRAFT', 'Description', 'Ceramic', 'Gold', '#C5A059', '', '', 'MODAL-IMPORT-GOLD', '', '999', '', 'TRUE', driveUrl, ''];
        const csv = `${catalogueCsvHeaders.join(',')}\n${values.map((value) => `"${value.replace(/"/g, '""')}"`).join(',')}`;
        const file = { name: 'modal-import.csv', text: vi.fn().mockResolvedValue(csv) } as unknown as File;
        const input = container.querySelector<HTMLInputElement>('input[type="file"][accept*=".csv"]');
        Object.defineProperty(input, 'files', { configurable: true, value: [file] });

        await act(async () => {
            input?.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise((resolve) => window.setTimeout(resolve, 100));
        });

        const importDialog = document.body.querySelector('[aria-labelledby="catalogue-import-dialog-title"]');
        expect(importDialog).not.toBeNull();
        expect(importDialog?.textContent).toContain('Catalogue import in progress');
        expect(importDialog?.textContent).toContain('modal-import.csv');
        expect(importDialog?.textContent).toContain('Downloading image 1 for option MODAL-IMPORT-GOLD');
        expect(importDialog?.querySelector('[role="progressbar"]')).not.toBeNull();

        await act(async () => {
            releaseDriveImage?.();
            await new Promise((resolve) => window.setTimeout(resolve, 350));
        });

        expect(document.body.querySelector('[aria-labelledby="catalogue-import-dialog-title"]')).toBeNull();
        expect(container.textContent).toContain('Bulk import finished');
    });

    it('removes an auto-created category when the rest of the import fails', async () => {
        mockAuthenticated = true;
        mockRoles = ['ADMIN'];
        mockImportedProductFailure = true;
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const container = await render(<AdminPage />, '/admin/catalogue');
        const values = ['Dinner Plate', 'Dinner Sets', 'DRAFT', '', '', 'Blue', '#0000FF', '', '', 'DINNER-PLATE', '', '999', '', 'TRUE', '', ''];
        const csv = `${catalogueCsvHeaders.join(',')}\n${values.join(',')}`;
        const file = { name: 'catalogue.csv', text: vi.fn().mockResolvedValue(csv) } as unknown as File;
        const input = container.querySelector<HTMLInputElement>('input[type="file"][accept*=".csv"]');
        Object.defineProperty(input, 'files', { configurable: true, value: [file] });

        await act(async () => {
            input?.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise((resolve) => window.setTimeout(resolve, 300));
        });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringMatching(/\/admin\/catalogue\/categories\/new-category-id$/),
            expect.objectContaining({ method: 'DELETE' }),
        );
        expect(container.textContent).toContain('All changes from this file were rolled back');
    });

    const catalogueRequests = (pattern: RegExp, method: string) =>
        fetchMock.mock.calls
            .filter(([request, init]) => pattern.test(String(request)) && init?.method === method)
            .map(([request, init]) => ({ url: String(request), body: JSON.parse(String(init?.body || '{}')) as Record<string, unknown> }));

    const setFieldValue = (element: HTMLInputElement | HTMLSelectElement | null, value: string) => {
        if (!element) throw new Error('Field not found');
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set?.call(element, value);
        element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    };

    const fillNewProduct = async (container: HTMLElement, prices: { price: string; compareAt?: string }) => {
        const addProduct = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Add Product'));
        await act(async () => {
            addProduct?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        const dialog = document.body.querySelector<HTMLFormElement>('form[aria-labelledby="product-dialog-title"]')!;
        await act(async () => {
            setFieldValue(dialog.querySelector<HTMLInputElement>('input[name="name"]'), 'Onyx Dinner Set');
            setFieldValue(dialog.querySelector<HTMLSelectElement>('select[name="categoryId"]'), product.categoryId);
            setFieldValue(dialog.querySelector<HTMLInputElement>('input[placeholder="GHC-SET-SAGE"]'), 'ONYX-SET');
            setFieldValue(dialog.querySelector<HTMLInputElement>('input[placeholder="999.00"]'), prices.price);
            if (prices.compareAt) setFieldValue(dialog.querySelector<HTMLInputElement>('input[placeholder="Optional"]'), prices.compareAt);
        });
        return dialog;
    };

    it('creates a published product as a draft and publishes it only after its options are saved', async () => {
        mockAuthenticated = true;
        mockRoles = ['ADMIN'];
        const container = await render(<AdminPage />, '/admin/catalogue');
        const dialog = await fillNewProduct(container, { price: '999' });

        await act(async () => {
            dialog.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await new Promise((resolve) => window.setTimeout(resolve, 200));
        });

        const created = catalogueRequests(/\/admin\/catalogue\/products$/, 'POST');
        expect(created).toHaveLength(1);
        expect(created[0].body).toMatchObject({ name: 'Onyx Dinner Set', status: 'DRAFT' });
        const variant = catalogueRequests(/\/admin\/catalogue\/products\/new-product-id\/variants$/, 'POST');
        expect(variant[0].body).toMatchObject({ sku: 'ONYX-SET', pricePaise: 99_900, color: null });
        const published = catalogueRequests(/\/admin\/catalogue\/products\/new-product-id$/, 'PATCH');
        expect(published.at(-1)?.body).toEqual({ status: 'PUBLISHED' });
        const callUrls = fetchMock.mock.calls.map(([request, init]) => `${init?.method || 'GET'} ${String(request)}`);
        expect(callUrls.findIndex((call) => call.endsWith('/new-product-id/variants')))
            .toBeLessThan(callUrls.findIndex((call) => call.startsWith('PATCH') && call.endsWith('/new-product-id')));
        expect(container.textContent).toContain('New product created successfully.');
    });

    it('rejects a compare-at price below the price before saving anything', async () => {
        mockAuthenticated = true;
        mockRoles = ['ADMIN'];
        const container = await render(<AdminPage />, '/admin/catalogue');
        const dialog = await fillNewProduct(container, { price: '999', compareAt: '899' });

        await act(async () => {
            dialog.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await new Promise((resolve) => window.setTimeout(resolve, 50));
        });

        expect(catalogueRequests(/\/admin\/catalogue\/products$/, 'POST')).toHaveLength(0);
        expect(document.body.textContent).toContain('Compare-at price for option 1 cannot be lower than its price.');
    });

    it('matches an exported product by slug after a rename and clears a blank colour', async () => {
        mockAuthenticated = true;
        mockRoles = ['ADMIN'];
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const container = await render(<AdminPage />, '/admin/catalogue');
        const rows = [
            ['Renamed Serving Set', 'Serveware', 'PUBLISHED', '', '', '', '', '', '', 'GHC-NOIR-GOLD', '', '2499', '', '', '', '', product.slug],
            ['Renamed Serving Set', 'Serveware', 'PUBLISHED', '', '', 'Onyx', '#111111', '', '', 'GHC-NOIR-ONYX', '', '2699', '', 'TRUE', '', '', product.slug],
        ];
        const csv = `${catalogueCsvHeaders.join(',')}\n${rows.map((row) => row.map((value) => `"${value}"`).join(',')).join('\n')}`;
        const file = { name: 'renamed.csv', text: vi.fn().mockResolvedValue(csv) } as unknown as File;
        const input = container.querySelector<HTMLInputElement>('input[type="file"][accept*=".csv"]');
        Object.defineProperty(input, 'files', { configurable: true, value: [file] });

        await act(async () => {
            input?.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise((resolve) => window.setTimeout(resolve, 300));
        });

        expect(catalogueRequests(/\/admin\/catalogue\/products$/, 'POST')).toHaveLength(0);
        const productUpdate = catalogueRequests(new RegExp(`/admin/catalogue/products/${product.id}$`), 'PATCH');
        expect(productUpdate[0].body).toMatchObject({ name: 'Renamed Serving Set', slug: product.slug });
        const variantUpdate = catalogueRequests(new RegExp(`/admin/catalogue/variants/${product.variants[0].id}$`), 'PATCH');
        expect(variantUpdate[0].body).toMatchObject({ sku: 'GHC-NOIR-GOLD', color: null, isActive: true });
        expect(catalogueRequests(new RegExp(`/admin/catalogue/products/${product.id}/variants$`), 'POST')[0].body)
            .toMatchObject({ sku: 'GHC-NOIR-ONYX', color: 'Onyx', colorHex: '#111111' });
        expect(container.textContent).toContain('Bulk import finished');
        // The page shows one page of products, so the import read the whole catalogue to match rows.
        expect(fetchMock.mock.calls.some(([request]) => String(request).endsWith('/admin/catalogue/products/all'))).toBe(true);
    });

    it('searches, filters and pages the product list on the server', async () => {
        mockAuthenticated = true;
        mockRoles = ['ADMIN'];
        const container = await render(<AdminPage />, '/admin/catalogue');
        const listRequests = () => fetchMock.mock.calls
            .map(([request]) => String(request))
            .filter((url) => url.includes('/admin/catalogue/products?'))
            .map((url) => Object.fromEntries(new URL(url, 'http://localhost').searchParams));

        expect(listRequests()).toEqual([{ page: '1', limit: '20' }]);
        // The whole catalogue is only read for an import or export.
        expect(fetchMock.mock.calls.some(([request]) => String(request).endsWith('/admin/catalogue/products/all'))).toBe(false);
        expect(container.textContent).toContain('Showing 1–1 of 1');

        const search = container.querySelector<HTMLInputElement>('input[aria-label="Search products"]');
        await act(async () => {
            for (const value of ['n', 'no', 'noi', 'noir']) setFieldValue(search, value);
            await new Promise((resolve) => window.setTimeout(resolve, 100));
        });
        // Typing is debounced: nothing is sent until it pauses.
        expect(listRequests()).toHaveLength(1);
        await act(async () => {
            await new Promise((resolve) => window.setTimeout(resolve, 350));
        });
        expect(listRequests()).toEqual([{ page: '1', limit: '20' }, { page: '1', limit: '20', q: 'noir' }]);

        await act(async () => {
            setFieldValue(container.querySelector<HTMLSelectElement>('select[aria-label="Filter by status"]'), 'DRAFT');
            setFieldValue(container.querySelector<HTMLSelectElement>('select[aria-label="Products per page"]'), '50');
            await new Promise((resolve) => window.setTimeout(resolve, 50));
        });
        expect(listRequests().at(-1)).toEqual({ page: '1', limit: '50', q: 'noir', status: 'DRAFT' });
        expect(container.textContent).toContain('Noir Gold Serving Set');
    });

    const openFirstProductEditor = async (container: HTMLElement) => {
        await act(async () => {
            container.querySelector('button[title="Edit Product"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await new Promise((resolve) => window.setTimeout(resolve, 50));
        });
    };
    const galleryOrder = () => Array.from(document.body.querySelectorAll('ol[aria-label="Product images in storefront order"] img'))
        .map((image) => image.getAttribute('src'));
    const clickMove = async (label: string) => {
        await act(async () => {
            document.body.querySelector(`button[aria-label="${label}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await new Promise((resolve) => window.setTimeout(resolve, 50));
        });
    };

    it('moves an existing image earlier and saves the whole order in one request', async () => {
        mockAuthenticated = true;
        mockRoles = ['ADMIN'];
        const container = await render(<AdminPage />, '/admin/catalogue');
        await openFirstProductEditor(container);

        expect(galleryOrder()).toEqual(['/product.webp', '/sage.webp']);
        expect(document.body.querySelector('button[aria-label="Move image 1 of 2 earlier"]')?.getAttribute('aria-disabled')).toBe('true');
        await clickMove('Move image 2 of 2 earlier');

        const orders = catalogueRequests(new RegExp(`/admin/catalogue/products/${product.id}/images/order$`), 'PUT');
        expect(orders).toHaveLength(1);
        expect(orders[0].body).toEqual({ imageIds: [product.images[1].id, product.images[0].id] });
        expect(galleryOrder()).toEqual(['/sage.webp', '/product.webp']);
        expect(document.body.textContent).toContain('Image moved to position 1 of 2.');
        // The first image cannot move earlier; the last cannot move later.
        expect(document.body.querySelector('button[aria-label="Move image 1 of 2 earlier"]')?.getAttribute('aria-disabled')).toBe('true');
        expect(document.body.querySelector('button[aria-label="Move image 2 of 2 later"]')?.getAttribute('aria-disabled')).toBe('true');
    });

    it('puts the images back in their saved order when the new order is refused', async () => {
        mockAuthenticated = true;
        mockRoles = ['ADMIN'];
        mockImageOrderFailure = true;
        const container = await render(<AdminPage />, '/admin/catalogue');
        await openFirstProductEditor(container);

        await clickMove('Move image 1 of 2 later');

        expect(catalogueRequests(/\/images\/order$/, 'PUT')).toHaveLength(1);
        expect(galleryOrder()).toEqual(['/product.webp', '/sage.webp']);
        expect(document.body.textContent).toContain('Image order not saved');
    });

    it('shows who changed which record and the before/after values', async () => {
        mockAuthenticated = true;
        mockRoles = ['ADMIN'];
        const container = await render(<AdminPage />, '/admin/audit-logs');

        expect(container.textContent).toContain('admin@example.com');
        expect(container.textContent).toContain('Noir Gold Serving Set · GHC-NOIR-GOLD');
        expect(container.textContent).toContain('Price');
        expect(container.textContent).toMatch(/₹2,499\s*→\s*₹2,599/);
        expect(container.textContent).toContain('Active');
        expect(container.textContent).toMatch(/Yes\s*→\s*No/);
    });

    it('presents team access with readable role names and explicit editing', async () => {
        mockAuthenticated = true;
        mockRoles = ['ADMIN'];
        const container = await render(<AdminPage />, '/admin/users');

        expect(container.textContent).toContain('Team directory');
        expect(container.textContent).toContain('Faheem Admin');
        expect(container.textContent).toContain('Sana Khan');
        expect(container.textContent).toContain('Catalogue manager');
        expect(container.textContent).not.toContain('CATALOGUE_MANAGER');

        const editButtons = Array.from(container.querySelectorAll('button')).filter((button) => button.textContent === 'Edit access');
        await act(async () => editButtons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

        const ownAdminRole = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
        expect(ownAdminRole?.checked).toBe(true);
        expect(ownAdminRole?.disabled).toBe(true);
        expect(container.textContent).toContain('Your own admin access is protected.');
    });

    it('asks before removing every role from a team member', async () => {
        mockAuthenticated = true;
        mockRoles = ['ADMIN'];
        const container = await render(<AdminPage />, '/admin/users');
        const editButtons = Array.from(container.querySelectorAll('button')).filter((button) => button.textContent === 'Edit access');
        await act(async () => editButtons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
        for (const checkbox of Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).filter((input) => input.checked)) {
            await act(async () => checkbox.dispatchEvent(new MouseEvent('click', { bubbles: true })));
        }
        const save = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Remove access…');
        await act(async () => save?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

        expect(container.textContent).toContain('Remove all access for Sana Khan?');
        expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
    });

    it('confirms before suspending, reinstating or resetting a team member', async () => {
        mockAuthenticated = true;
        mockRoles = ['ADMIN'];
        const staffCalls: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (/\/admin\/users\/[^/]+\/(suspend|reinstate|password-reset)$/.test(url) && init?.method === 'POST') {
                staffCalls.push(url.split('/admin/users/')[1]);
                return url.endsWith('password-reset') ? new Response(null, { status: 204 }) : json({});
            }
            if (url.endsWith('/admin/users') && (!init?.method || init.method === 'GET')) {
                return json([
                    { id: 'user-1', email: 'admin@example.com', fullName: 'Faheem Admin', roles: ['ADMIN'], createdAt: '2026-07-01T08:00:00.000Z', suspended: false, bannedUntil: null },
                    { id: 'staff-1', email: 'sana@example.com', fullName: 'Sana Khan', roles: ['SUPPORT_AGENT'], createdAt: '2026-08-01T08:00:00.000Z', suspended: false, bannedUntil: null },
                    { id: 'staff-2', email: 'ravi@example.com', fullName: 'Ravi Nair', roles: ['WAREHOUSE_MANAGER'], createdAt: '2026-08-02T08:00:00.000Z', suspended: true, bannedUntil: '2126-08-02T08:00:00.000Z' },
                ]);
            }
            return fetchMock(input, init);
        }));
        const container = await render(<AdminPage />, '/admin/users');
        const click = async (element: Element | undefined) => act(async () => element?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
        const button = (text: string) => Array.from(container.querySelectorAll('button')).find((item) => item.textContent === text);
        const editButtons = () => Array.from(container.querySelectorAll('button')).filter((item) => item.textContent === 'Edit access' || item.textContent === 'Editing');

        expect(Array.from(container.querySelectorAll('span')).filter((item) => item.textContent === 'Suspended')).toHaveLength(1);

        // Your own account cannot be suspended.
        await click(editButtons()[0]);
        expect(button('Suspend account')).toBeUndefined();
        expect(container.textContent).toContain('You cannot suspend your own account.');

        await click(editButtons()[1]);
        await click(button('Suspend account'));
        expect(container.textContent).toContain('Suspend Sana Khan?');
        expect(staffCalls).toEqual([]);
        await click(button('Suspend account'));
        expect(staffCalls).toEqual(['staff-1/suspend']);
        expect(container.textContent).toContain('Sana Khan is suspended and has been signed out.');

        await click(button('Send password reset'));
        expect(container.textContent).toContain('Email a password reset link to sana@example.com?');
        await click(button('Send reset email'));
        expect(staffCalls).toEqual(['staff-1/suspend', 'staff-1/password-reset']);

        await click(editButtons()[2]);
        expect(button('Send password reset')?.disabled).toBe(true);
        await click(button('Reinstate account'));
        expect(container.textContent).toContain('Reinstate Ravi Nair?');
        await click(button('Reinstate account'));
        expect(staffCalls).toEqual(['staff-1/suspend', 'staff-1/password-reset', 'staff-2/reinstate']);
    });

    it('shows a not-found page for unknown admin paths instead of the overview', async () => {
        mockAuthenticated = true;
        mockRoles = ['SUPPORT_AGENT'];
        const container = await render(<AdminPage />, '/admin/not-a-section');
        expect(container.textContent).toContain('Page not found');
        expect(container.textContent).not.toContain('Workspace / Overview');
    });

    it('keeps staff on a retry screen when the backend cannot be reached', async () => {
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
            String(input).endsWith('/auth/session') ? json({ message: 'Service Unavailable' }, 503) : fetchMock(input, init)));
        const container = await render(<AdminPage />, '/admin/orders');
        expect(container.textContent).toContain('We can’t reach the store service');
        expect(routerState.path).toBe('/admin/orders');
    });

    it('keeps the query string when sending signed-out staff to sign in', async () => {
        await render(<AdminPage />, '/admin/orders?status=PAID');
        expect(routerState.path).toBe('/admin/login?next=%2Fadmin%2Forders%3Fstatus%3DPAID');
    });

    it('tells staff their session expired when they are sent back to sign in', async () => {
        const container = await render(<AdminLoginPage />, '/admin/login?next=%2Fadmin%2Forders&reason=expired');
        expect(container.textContent).toContain('Your session expired');
    });

    it('offers only valid order actions for the staff role and shipment state', async () => {
        const adminOrder = (shipments: unknown[]) => ({
            id: '66666666-6666-4666-8666-666666666666',
            orderNumber: 'GHC-ORDER-1',
            status: 'PROCESSING',
            currency: 'INR',
            itemsSnapshot: [],
            addressSnapshot: { recipientName: 'Asha', email: 'asha@example.com' },
            subtotalPaise: 10_000,
            discountPaise: 0,
            shippingPaise: 0,
            taxPaise: 0,
            totalPaise: 10_000,
            createdAt: '2026-10-01T08:00:00.000Z',
            updatedAt: '2026-10-01T08:00:00.000Z',
            payments: [],
            shipments,
            returns: [],
        });
        let detail = adminOrder([]);
        const ordersFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.includes('/admin/orders/66666666-6666-4666-8666-666666666666')) return json(detail);
            if (url.includes('/admin/orders?')) return json([{ ...detail, itemCount: 0 }]);
            return fetchMock(input, init);
        });
        vi.stubGlobal('fetch', ordersFetch);
        mockAuthenticated = true;
        mockRoles = ['ADMIN'];
        await render(<AdminPage />, '/admin/orders');
        const click = async (label: string) => {
            const button = Array.from(document.body.querySelectorAll('button')).find((item) => item.textContent?.trim() === label);
            expect(button, label).toBeDefined();
            await act(async () => {
                button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                await new Promise((resolve) => window.setTimeout(resolve, 20));
            });
        };

        // Cancelling the mark-shipped form never ships the order.
        await click('View');
        await click('Mark shipped');
        expect(document.body.textContent).toContain('Confirm the order has left the warehouse');
        await click('Cancel');
        expect(ordersFetch.mock.calls.some(([request, init]) => String(request).includes('/mark-shipped') && init?.method === 'POST')).toBe(false);
        act(() => mountedRoot?.unmount());
        document.body.innerHTML = '';

        // A support agent changes no fulfilment state: no shipping, processing or cancel actions.
        const hasButton = (label: string) => Array.from(document.body.querySelectorAll('button')).some((item) => item.textContent?.trim() === label);
        detail = adminOrder([
            { id: 'ship-1', orderId: detail.id, provider: 'manual', status: 'CREATED', createdAt: '', updatedAt: '', events: [], items: [] },
        ]);
        mockRoles = ['SUPPORT_AGENT'];
        await render(<AdminPage />, '/admin/orders');
        await click('View');
        expect(document.body.textContent).toContain('GHC-ORDER-1');
        for (const label of ['Mark shipped', 'Cancel order']) expect(hasButton(label), label).toBe(false);
        act(() => mountedRoot?.unmount());
        document.body.innerHTML = '';

        detail = { ...detail, status: 'CONFIRMED', shipments: [] };
        await render(<AdminPage />, '/admin/orders');
        await click('View');
        expect(hasButton('Start processing')).toBe(false);
        act(() => mountedRoot?.unmount());
        document.body.innerHTML = '';

        // A warehouse manager can mark the order shipped but cannot cancel it, and tracking is no longer entered by hand.
        detail = adminOrder([
            { id: 'ship-1', orderId: detail.id, provider: 'manual', status: 'CREATED', createdAt: '', updatedAt: '', events: [], items: [] },
        ]);
        mockRoles = ['WAREHOUSE_MANAGER'];
        await render(<AdminPage />, '/admin/orders');
        await click('View');
        expect(hasButton('Cancel order')).toBe(false);
        expect(hasButton('Add tracking update')).toBe(false);
        expect(hasButton('Mark shipped')).toBe(true);
    });

    it('lets an admin cancel a paid order with a reason after confirming the refund', async () => {
        const orderId = '77777777-7777-4777-8777-777777777777';
        let detail: Record<string, unknown> = {
            id: orderId,
            orderNumber: 'GHC-ORDER-2',
            status: 'CONFIRMED',
            currency: 'INR',
            itemsSnapshot: [],
            addressSnapshot: { recipientName: 'Asha', email: 'asha@example.com' },
            subtotalPaise: 25_000,
            discountPaise: 0,
            shippingPaise: 0,
            taxPaise: 0,
            totalPaise: 25_000,
            hdfcOrderId: 'hdfc-2',
            createdAt: '2026-10-01T08:00:00.000Z',
            updatedAt: '2026-10-01T08:00:00.000Z',
            payments: [{ id: 'pay-2', status: 'CAPTURED', amountPaise: 25_000, currency: 'INR', method: 'UPI', refunds: [] }],
            shipments: [],
            returns: [],
        };
        const ordersFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.endsWith(`/admin/orders/${orderId}/cancel`) && init?.method === 'POST') {
                detail = { ...detail, status: 'CANCELLED' };
                return json(detail);
            }
            if (url.includes(`/admin/orders/${orderId}`)) return json(detail);
            if (url.includes('/admin/orders?')) return json([{ ...detail, itemCount: 0 }]);
            return fetchMock(input, init);
        });
        vi.stubGlobal('fetch', ordersFetch);
        mockAuthenticated = true;
        mockRoles = ['ADMIN'];
        await render(<AdminPage />, '/admin/orders');
        const button = (label: string) => Array.from(document.body.querySelectorAll('button')).find((item) => item.textContent?.trim() === label);
        const click = async (label: string) => {
            expect(button(label), label).toBeDefined();
            await act(async () => {
                button(label)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                await new Promise((resolve) => window.setTimeout(resolve, 20));
            });
        };
        const cancelCalls = () => ordersFetch.mock.calls.filter(([request, init]) => String(request).endsWith('/cancel') && init?.method === 'POST');

        await click('View');
        await click('Cancel order');
        const dialog = document.body.querySelector('[role="alertdialog"]');
        expect(dialog?.textContent).toContain('Cancel order GHC-ORDER-2?');
        expect(dialog?.textContent).toMatch(/refunded\s*₹\s*250/);

        // A reason is required before anything is sent.
        await click('Cancel order and refund');
        expect(document.body.textContent).toContain('Enter a reason');
        expect(cancelCalls()).toHaveLength(0);

        const reason = document.body.querySelector<HTMLTextAreaElement>('[role="alertdialog"] textarea')!;
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(reason, 'Customer asked to cancel');
            reason.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await click('Cancel order and refund');
        expect(cancelCalls()).toHaveLength(1);
        expect(JSON.parse(String(cancelCalls()[0][1]?.body))).toEqual({ reason: 'Customer asked to cancel' });
        // The dialog refreshes in place: the order is cancelled and no longer offers cancellation.
        expect(document.body.textContent).toContain('Order cancelled and stock released.');
        expect(document.body.querySelector('[role="alertdialog"]')).toBeNull();
        expect(button('Cancel order')).toBeUndefined();
    });

    it('escapes script-closing characters in product JSON-LD', () => {
        const serialized = serializeJsonLd({
            name: '</script><script>alert(1)</script>',
        });
        expect(serialized).not.toContain('</script>');
        expect(serialized).toContain('\\u003c/script\\u003e');
    });
});
