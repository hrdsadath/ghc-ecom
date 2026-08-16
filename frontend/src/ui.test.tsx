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
import { serializeJsonLd } from './components/SEOHead';
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

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('/google-drive?id=')) {
        if (mockDriveImageGate) await mockDriveImageGate;
        return new Response(new Uint8Array([137, 80, 78, 71]), {
            status: 200,
            headers: {
                'content-type': 'image/png',
                'content-disposition': 'attachment; filename="catalogue.png"',
            },
        });
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
            },
        ]);
    }
    if (url.endsWith('/admin/inventory/warehouses')) {
        return json([{ id: 'warehouse-1', code: 'MAIN', name: 'Main Warehouse', isActive: true }]);
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
    if (url.endsWith('/admin/audit-logs')) {
        return json([
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
        ]);
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
        expect(galleryStrip?.querySelectorAll('button')).toHaveLength(6);
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

    it('limits imported summaries and transfers Drive images through the same-origin download path', async () => {
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
        expect(fetchMock.mock.calls.some(([request]) => String(request).startsWith('/google-drive?id='))).toBe(true);
        expect(fetchMock.mock.calls.some(([request, init]) =>
            /\/admin\/catalogue\/products\/[^/]+\/images$/.test(String(request)) && init?.method === 'POST' && init.body instanceof FormData)).toBe(true);
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

        expect(fetchMock.mock.calls.filter(([request]) => String(request).startsWith('/google-drive?id='))).toHaveLength(1);
        expect(fetchMock.mock.calls.filter(([request, init]) =>
            /\/admin\/catalogue\/products\/[^/]+\/images$/.test(String(request)) && init?.method === 'POST')).toHaveLength(1);
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

    it('escapes script-closing characters in product JSON-LD', () => {
        const serialized = serializeJsonLd({
            name: '</script><script>alert(1)</script>',
        });
        expect(serialized).not.toContain('</script>');
        expect(serialized).toContain('\\u003c/script\\u003e');
    });
});
