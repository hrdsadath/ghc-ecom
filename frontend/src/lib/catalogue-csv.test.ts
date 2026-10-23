import { describe, expect, it } from 'vitest';
import {
    catalogueCsvHeaders,
    catalogueCsvExport,
    catalogueCsvTemplate,
    driveLinksFromCsvCell,
    importRupeesToPaise,
    parseCatalogueCsv,
    validateCatalogueCsvRows,
} from './catalogue-csv';
import { Product } from '../types';

const product: Product = {
    id: 'product-id',
    categoryId: 'category-id',
    name: 'Noir, Gold Set',
    slug: 'noir-gold-set',
    shortDescription: 'Legacy short summary',
    description: 'Quoted "description"',
    material: 'Stoneware',
    status: 'PUBLISHED',
    category: {
        id: 'category-id',
        name: 'Tea Sets',
        slug: 'tea-sets',
        isPublished: true,
        sortOrder: 0,
    },
    variants: [
        {
            id: 'variant-id',
            sku: 'GHC-NOIR-GOLD',
            alias: 'NOIR GOLD',
            pricePaise: 129_950,
            compareAtPricePaise: 149_900,
            attributes: { color: 'Gold', colorHex: '#C5A059', size: 'Large', packQuantity: 2 },
            isActive: true,
            availableStock: 4,
        },
    ],
    images: [],
    videos: [],
};

describe('catalogue CSV', () => {
    it('matches every editable text field in Add Product without stale columns', () => {
        expect(catalogueCsvHeaders).toEqual([
            'product_name',
            'category_name',
            'status',
            'description',
            'material',
            'color',
            'color_hex',
            'size',
            'pack_quantity',
            'sku',
            'alias',
            'price_rupees',
            'compare_at_price_rupees',
            'is_active',
            'option_google_drive_image_links',
            'shared_google_drive_image_links',
            'product_slug',
        ]);
    });

    it('exports existing products and parses them back without losing rupee prices or quoted text', () => {
        const [row] = parseCatalogueCsv(catalogueCsvExport([product]));

        expect(row).toMatchObject({
            product_name: 'Noir, Gold Set',
            category_name: 'Tea Sets',
            description: 'Quoted "description"',
            material: 'Stoneware',
            color: 'Gold',
            color_hex: '#C5A059',
            size: 'Large',
            pack_quantity: '2',
            sku: 'GHC-NOIR-GOLD',
            alias: 'NOIR GOLD',
            price_rupees: '1299.5',
            compare_at_price_rupees: '1499',
            is_active: 'TRUE',
        });
    });

    it('exports the product slug so a renamed product still matches on re-import', () => {
        const [row] = parseCatalogueCsv(catalogueCsvExport([product]).replace('Noir, Gold Set', 'Renamed Set'));

        expect(row).toMatchObject({ product_name: 'Renamed Set', product_slug: 'noir-gold-set', explicit_slug: true });
    });

    it('falls back to a slug from the name for files without a product_slug column', () => {
        const [row] = parseCatalogueCsv('product_name,category_name,status,sku,price_rupees\nOld File Cup,Cups,DRAFT,OLD-CUP,499');

        expect(row).toMatchObject({ product_slug: 'old-file-cup', explicit_slug: false });
    });

    it('adds a new blank-slug row to the exported product with the same name', () => {
        const exported = catalogueCsvExport([product]);
        const extraRow = ['Noir, Gold Set', 'Tea Sets', 'PUBLISHED', 'Quoted ""description""', 'Stoneware', 'Sage', '', '', '', 'GHC-NOIR-SAGE', '', '999', '', 'TRUE', '', '', '']
            .map((value) => `"${value}"`)
            .join(',');
        const rows = parseCatalogueCsv(`${exported}${extraRow}\r\n`);

        expect(rows.map((row) => [row.sku, row.product_slug, row.explicit_slug])).toEqual([
            ['GHC-NOIR-GOLD', 'noir-gold-set', true],
            ['GHC-NOIR-SAGE', 'noir-gold-set', true],
        ]);
        expect(validateCatalogueCsvRows(rows)).toEqual([]);
    });

    it('rejects malformed product slugs and over-long names before import', () => {
        const rows = parseCatalogueCsv(catalogueCsvExport([product]));
        rows[0].product_slug = 'Bad Slug!';
        rows[0].product_name = 'x'.repeat(181);

        expect(validateCatalogueCsvRows(rows)).toEqual(
            expect.arrayContaining([
                'Row 2: product_slug may only contain lowercase letters, numbers and single dashes.',
                'Row 2: product_name must be 180 characters or fewer.',
            ]),
        );
    });

    it('imports the legacy barcode column as the renamed alias field', () => {
        const legacyCsv = catalogueCsvExport([product]).replace(',"alias",', ',"barcode",');
        const [row] = parseCatalogueCsv(legacyCsv);

        expect(row.alias).toBe('NOIR GOLD');
    });

    it('provides a downloadable template with product examples', () => {
        const rows = parseCatalogueCsv(catalogueCsvTemplate());

        expect(rows).toHaveLength(3);
        expect(rows[0]).toMatchObject({
            product_name: 'Noir Gold Tea Set',
            product_slug: 'noir-gold-tea-set',
            sku: 'EXAMPLE-TEA-GOLD-L-1',
        });
        expect(rows[2]).toMatchObject({
            product_name: 'Handcrafted Serving Bowl',
            category_name: 'Serveware',
        });
        expect(validateCatalogueCsvRows(rows)).toEqual([]);
    });

    it('allows a new category name so import can create it', () => {
        const rows = parseCatalogueCsv(catalogueCsvExport([product]));
        rows[0].category_name = 'Brand New Category';

        expect(validateCatalogueCsvRows(rows)).toEqual([]);
    });

    it('validates required category names, duplicate SKUs, prices, and booleans before import', () => {
        const rows = parseCatalogueCsv(catalogueCsvExport([product]));
        rows.push({ ...rows[0], sourceRow: 3, category_name: '', price_rupees: '12.999', is_active: 'maybe' });

        expect(validateCatalogueCsvRows(rows)).toEqual(
            expect.arrayContaining([
                'Row 3: category_name is required.',
                'Row 3: sku duplicates row 2.',
                'Row 3: price_rupees must be a non-negative amount with at most two decimals.',
                'Row 3: is_active must be TRUE or FALSE.',
            ]),
        );
    });

    it('allows duplicate aliases and preserves alias text while keeping SKUs unique', () => {
        const rows = parseCatalogueCsv(catalogueCsvExport([product]));
        rows[0].alias = 'Gift set — popular 😊';
        rows.push({
            ...rows[0],
            sourceRow: 3,
            sku: 'GHC-NOIR-SAGE-2',
        });

        expect(validateCatalogueCsvRows(rows)).toEqual([]);
        expect(rows.map((row) => row.alias)).toEqual([
            'Gift set — popular 😊',
            'Gift set — popular 😊',
        ]);
    });

    it('converts rupee inputs and pipe-separated Drive links', () => {
        expect(importRupeesToPaise('1299.50')).toBe(129_950);
        expect(importRupeesToPaise('12.999')).toBeUndefined();
        expect(driveLinksFromCsvCell('https://drive.google.com/a | https://drive.google.com/b')).toHaveLength(2);
        expect(driveLinksFromCsvCell('https://drive.google.com/a | https://drive.google.com/a')).toEqual(['https://drive.google.com/a']);
    });

    it('keeps old colour-only CSV files compatible and validates pack quantities', () => {
        const legacyCsv = 'product_name,category_name,status,color,sku,price_rupees\nLegacy Cup,Cups,DRAFT,Green,LEGACY-GREEN,499';
        const [legacy] = parseCatalogueCsv(legacyCsv);
        expect(legacy).toMatchObject({ size: '', pack_quantity: '', color: 'Green' });
        expect(validateCatalogueCsvRows([legacy])).toEqual([]);

        legacy.pack_quantity = '1.5';
        expect(validateCatalogueCsvRows([legacy])).toContain('Row 2: pack_quantity must be a positive whole number.');
    });
});
