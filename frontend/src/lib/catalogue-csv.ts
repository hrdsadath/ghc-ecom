import { Product } from '../types';
import { slugify } from './commerce';

export const catalogueCsvHeaders = [
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
    // Last, so files from before this column existed still line up. Exports fill it so a
    // renamed product still matches on re-import; leave it blank for new products.
    'product_slug',
] as const;

export type CatalogueCsvHeader = (typeof catalogueCsvHeaders)[number];
/**
 * `product_slug` is the file's slug when given, otherwise one made from the product name;
 * `explicit_slug` says which, because only a slug from the file identifies a renamed product.
 */
export type CatalogueCsvRow = Record<CatalogueCsvHeader, string> & { explicit_slug: boolean; sourceRow: number };

const productSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const requiredHeaders = [
    'product_name',
    'category_name',
    'status',
    'sku',
    'price_rupees',
] as const;

const spreadsheetSafe = (value: string): string => (/^[=+\-@]/.test(value) ? `'${value}` : value);

const csvCell = (value: string): string => `"${spreadsheetSafe(value).replace(/"/g, '""')}"`;

const csv = (rows: string[][]): string => `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;

export const catalogueCsvTemplate = (): string => csv([
    catalogueCsvHeaders.slice(),
    [
        'Noir Gold Tea Set',
        'Tea Sets',
        'DRAFT',
        'A six-piece tea set with a refined gold finish.',
        'Ceramic',
        'Gold',
        '#C9A35B',
        'Large',
        '1',
        'EXAMPLE-TEA-GOLD-L-1',
        'Gold large tea set',
        '1299',
        '1499',
        'TRUE',
        '',
        '',
        '',
    ],
    [
        'Noir Gold Tea Set',
        'Tea Sets',
        'DRAFT',
        'A six-piece tea set with a refined gold finish.',
        'Ceramic',
        'Sage Green',
        '#9CAF88',
        'Large',
        '2',
        'EXAMPLE-TEA-SAGE-L-2',
        'Sage large two-pack',
        '2399',
        '2699',
        'TRUE',
        '',
        '',
        '',
    ],
    [
        'Handcrafted Serving Bowl',
        'Serveware',
        'DRAFT',
        'Hand-finished serving bowl for dining tables and celebrations.',
        'Stoneware',
        'Natural',
        '#D8C3A5',
        'Medium',
        '',
        'EXAMPLE-BOWL-NATURAL',
        'Natural serving bowl',
        '899',
        '',
        'TRUE',
        '',
        '',
        '',
    ],
]);

const attributeText = (attributes: Record<string, unknown> | undefined, key: string): string => {
    const value = attributes?.[key];
    return typeof value === 'string' ? value : '';
};

const attributeNumber = (attributes: Record<string, unknown> | undefined, key: string): string => {
    const value = attributes?.[key];
    return typeof value === 'number' ? String(value) : '';
};

export const catalogueCsvExport = (products: Product[]): string => {
    const rows: string[][] = [catalogueCsvHeaders.slice()];
    for (const product of products) {
        for (const variant of product.variants) {
            rows.push([
                product.name,
                product.category.name,
                product.status,
                product.description || product.shortDescription || '',
                product.material || '',
                attributeText(variant.attributes, 'color'),
                attributeText(variant.attributes, 'colorHex'),
                attributeText(variant.attributes, 'size'),
                attributeNumber(variant.attributes, 'packQuantity'),
                variant.sku,
                variant.alias || '',
                String(variant.pricePaise / 100),
                variant.compareAtPricePaise == null ? '' : String(variant.compareAtPricePaise / 100),
                variant.isActive ? 'TRUE' : 'FALSE',
                '',
                '',
                product.slug,
            ]);
        }
    }
    return csv(rows);
};

const parseCsvRows = (text: string): string[][] => {
    const input = text.replace(/^\uFEFF/, '');
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;

    for (let index = 0; index < input.length; index += 1) {
        const character = input[index];
        if (quoted) {
            if (character === '"' && input[index + 1] === '"') {
                field += '"';
                index += 1;
            } else if (character === '"') {
                quoted = false;
            } else {
                field += character;
            }
            continue;
        }
        if (character === '"' && field === '') {
            quoted = true;
        } else if (character === ',') {
            row.push(field);
            field = '';
        } else if (character === '\n' || character === '\r') {
            if (character === '\r' && input[index + 1] === '\n') index += 1;
            row.push(field);
            if (row.some((value) => value.trim())) rows.push(row);
            row = [];
            field = '';
        } else {
            field += character;
        }
    }
    if (quoted) throw new Error('CSV contains an unclosed quoted cell.');
    row.push(field);
    if (row.some((value) => value.trim())) rows.push(row);
    return rows;
};

const importedCell = (value: string): string => {
    const trimmed = value.trim();
    return /^'[=+\-@]/.test(trimmed) ? trimmed.slice(1) : trimmed;
};

export const parseCatalogueCsv = (text: string): CatalogueCsvRow[] => {
    const rows = parseCsvRows(text);
    if (rows.length === 0) throw new Error('CSV is empty.');
    const headers = rows[0].map((header) => header.trim().toLowerCase());
    const missing = requiredHeaders.filter((header) => !headers.includes(header));
    if (missing.length > 0) throw new Error(`CSV is missing required columns: ${missing.join(', ')}.`);
    const legacyBarcodeColumn = headers.indexOf('barcode');

    const parsed = rows.slice(1).map((values, index) => {
        const row = Object.fromEntries(
            catalogueCsvHeaders.map((header) => {
                const currentColumn = headers.indexOf(header);
                const column = header === 'alias' && currentColumn < 0 ? legacyBarcodeColumn : currentColumn;
                return [header, column >= 0 ? importedCell(values[column] ?? '') : ''];
            }),
        ) as Record<CatalogueCsvHeader, string>;
        const fileSlug = row.product_slug.toLowerCase();
        return {
            ...row,
            product_slug: fileSlug || slugify(row.product_name),
            explicit_slug: Boolean(fileSlug),
            sourceRow: index + 2,
        };
    });
    // A row added under an exported product (same name, slug left blank) joins that product.
    const slugByName = new Map<string, string>();
    for (const row of parsed) {
        if (row.explicit_slug && !slugByName.has(row.product_name)) slugByName.set(row.product_name, row.product_slug);
    }
    return parsed.map((row) => {
        const slug = row.explicit_slug ? undefined : slugByName.get(row.product_name);
        return slug ? { ...row, product_slug: slug, explicit_slug: true } : row;
    });
};

export const importBoolean = (value: string): boolean | undefined => {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', '1'].includes(normalized)) return true;
    if (['false', 'no', '0'].includes(normalized)) return false;
    return undefined;
};

export const importRupeesToPaise = (value: string): number | undefined => {
    if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return undefined;
    const paise = Math.round(Number(value) * 100);
    return Number.isSafeInteger(paise) && paise <= 2_147_483_647 ? paise : undefined;
};

export const driveLinksFromCsvCell = (value: string): string[] =>
    [...new Set(value
        .split(/\||\r?\n/)
        .map((link) => link.trim())
        .filter(Boolean))];

export const validateCatalogueCsvRows = (rows: CatalogueCsvRow[]): string[] => {
    const errors: string[] = [];
    const seenSkus = new Map<string, number>();
    const productSignatures = new Map<string, string>();

    if (rows.length === 0) return ['The CSV has headers but no product rows.'];
    for (const row of rows) {
        const prefix = `Row ${row.sourceRow}`;
        if (!row.product_name) errors.push(`${prefix}: product_name is required.`);
        if (row.product_name.length > 180) errors.push(`${prefix}: product_name must be 180 characters or fewer.`);
        if (row.explicit_slug && !productSlugPattern.test(row.product_slug)) {
            errors.push(`${prefix}: product_slug may only contain lowercase letters, numbers and single dashes.`);
        }
        if (row.material.length > 120) errors.push(`${prefix}: material must be 120 characters or fewer.`);
        if (row.color.length > 80) errors.push(`${prefix}: color must be 80 characters or fewer.`);
        if (!row.category_name) errors.push(`${prefix}: category_name is required.`);
        if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(row.status.toUpperCase())) errors.push(`${prefix}: status must be DRAFT, PUBLISHED, or ARCHIVED.`);
        const sku = row.sku.toUpperCase();
        if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(sku)) errors.push(`${prefix}: sku is invalid.`);
        if (seenSkus.has(sku)) errors.push(`${prefix}: sku duplicates row ${seenSkus.get(sku)}.`);
        else seenSkus.set(sku, row.sourceRow);
        if (row.alias.length > 80) errors.push(`${prefix}: alias must be 80 characters or fewer.`);

        const pricePaise = importRupeesToPaise(row.price_rupees);
        if (pricePaise === undefined) errors.push(`${prefix}: price_rupees must be a non-negative amount with at most two decimals.`);
        if (row.compare_at_price_rupees) {
            const compareAt = importRupeesToPaise(row.compare_at_price_rupees);
            if (compareAt === undefined) errors.push(`${prefix}: compare_at_price_rupees is invalid.`);
            else if (pricePaise !== undefined && compareAt < pricePaise) errors.push(`${prefix}: compare-at price cannot be lower than price.`);
        }
        if (row.color_hex && !/^#[0-9A-Fa-f]{6}$/.test(row.color_hex)) errors.push(`${prefix}: color_hex must look like #C5A059.`);
        if (row.size.length > 80) errors.push(`${prefix}: size must be 80 characters or fewer.`);
        if (row.pack_quantity && (!/^\d+$/.test(row.pack_quantity) || Number(row.pack_quantity) < 1 || !Number.isSafeInteger(Number(row.pack_quantity)))) {
            errors.push(`${prefix}: pack_quantity must be a positive whole number.`);
        }
        if (row.is_active && importBoolean(row.is_active) === undefined) errors.push(`${prefix}: is_active must be TRUE or FALSE.`);

        for (const link of [...driveLinksFromCsvCell(row.option_google_drive_image_links), ...driveLinksFromCsvCell(row.shared_google_drive_image_links)]) {
            try {
                const url = new URL(link);
                if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com') throw new Error();
            } catch {
                errors.push(`${prefix}: “${link}” is not a valid Google Drive file link.`);
            }
        }

        const signature = JSON.stringify([
            row.product_name,
            row.category_name.toLowerCase(),
            row.status.toUpperCase(),
            row.description,
            row.material,
        ]);
        const previousSignature = productSignatures.get(row.product_slug);
        if (previousSignature && previousSignature !== signature) errors.push(`${prefix}: product fields conflict with another row for slug “${row.product_slug}”.`);
        else productSignatures.set(row.product_slug, signature);
    }
    return errors;
};
