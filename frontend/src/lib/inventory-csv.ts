import type { BulkInventoryRowInput, InventoryLevelView, Warehouse } from '../types';

export const inventoryCsvHeaders = ['warehouse_code', 'sku', 'on_hand', 'low_stock_threshold'] as const;
/**
 * Optional column written by Export. On import it guards against overwriting stock that changed
 * after the export (for example a paid order lowering on_hand): such rows are rejected.
 */
export const inventoryCsvOptionalHeaders = ['exported_on_hand'] as const;

/** The server applies one import in one transaction; larger files must be split. */
export const MAX_INVENTORY_IMPORT_ROWS = 5_000;

export type InventoryCsvHeader = (typeof inventoryCsvHeaders)[number];
export type InventoryCsvRow = Record<InventoryCsvHeader, string> & { sourceRow: number; exported_on_hand?: string };

export interface InventoryCsvExportRow {
    warehouseCode: string;
    sku: string;
    onHand: number;
    lowStockThreshold: number;
}

const csvCell = (value: string): string => `"${value.replace(/"/g, '""')}"`;
const csv = (rows: string[][]): string => `﻿${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;

export const inventoryCsvTemplate = (): string => csv([
    inventoryCsvHeaders.slice(),
    ['MAIN', 'EXAMPLE-TEA-GOLD', '24', '4'],
    ['MAIN', 'EXAMPLE-TEA-SAGE', '12', '3'],
]);

export const inventoryCsvExport = (rows: InventoryCsvExportRow[]): string => csv([
    [...inventoryCsvHeaders, ...inventoryCsvOptionalHeaders],
    ...rows.map((row) => [row.warehouseCode, row.sku, String(row.onHand), String(row.lowStockThreshold), String(row.onHand)]),
]);

const parseCsv = (text: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;
    const input = text.replace(/^﻿/, '');

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
        if (character === '"' && field === '') quoted = true;
        else if (character === ',') {
            row.push(field);
            field = '';
        } else if (character === '\n' || character === '\r') {
            if (character === '\r' && input[index + 1] === '\n') index += 1;
            row.push(field);
            if (row.some((value) => value.trim())) rows.push(row);
            row = [];
            field = '';
        } else field += character;
    }
    if (quoted) throw new Error('CSV contains an unclosed quoted cell.');
    row.push(field);
    if (row.some((value) => value.trim())) rows.push(row);
    return rows;
};

export const parseInventoryCsv = (text: string): InventoryCsvRow[] => {
    const rows = parseCsv(text);
    if (!rows.length) throw new Error('CSV is empty.');
    const headers = rows[0].map((header) => header.trim().toLowerCase());
    const missing = inventoryCsvHeaders.filter((header) => !headers.includes(header));
    if (missing.length) throw new Error(`CSV is missing required columns: ${missing.join(', ')}.`);
    const exportedIndex = headers.indexOf('exported_on_hand');
    return rows.slice(1).map((values, index) => {
        const row = Object.assign(
            { sourceRow: index + 2 },
            Object.fromEntries(inventoryCsvHeaders.map((header) => [header, values[headers.indexOf(header)]?.trim() || ''])),
        ) as unknown as InventoryCsvRow;
        if (exportedIndex >= 0) row.exported_on_hand = values[exportedIndex]?.trim() || '';
        return row;
    });
};

const nonNegativeInteger = (value: string): boolean => /^\d+$/.test(value);

export const validateInventoryCsvRows = (rows: InventoryCsvRow[]): string[] => {
    if (!rows.length) return ['The CSV has headers but no inventory rows.'];
    const errors: string[] = [];
    const seen = new Map<string, number>();
    for (const row of rows) {
        const prefix = `Row ${row.sourceRow}`;
        if (!row.warehouse_code) errors.push(`${prefix}: warehouse_code is required.`);
        if (!row.sku) errors.push(`${prefix}: sku is required.`);
        if (!nonNegativeInteger(row.on_hand)) errors.push(`${prefix}: on_hand must be a whole number of zero or more.`);
        if (!nonNegativeInteger(row.low_stock_threshold)) errors.push(`${prefix}: low_stock_threshold must be a whole number of zero or more.`);
        if (row.exported_on_hand && !nonNegativeInteger(row.exported_on_hand)) {
            errors.push(`${prefix}: exported_on_hand must be a whole number of zero or more (or left empty).`);
        }
        const key = `${row.warehouse_code.toUpperCase()}::${row.sku.toUpperCase()}`;
        if (seen.has(key)) errors.push(`${prefix}: duplicates warehouse/SKU from row ${seen.get(key)}.`);
        else seen.set(key, row.sourceRow);
    }
    return errors;
};

export interface InventoryImportChange extends BulkInventoryRowInput {
    sourceRow: number;
}

export interface InventoryImportPlan {
    changes: InventoryImportChange[];
    unchanged: number;
    errors: string[];
}

/**
 * Resolves CSV rows to warehouse/variant ids (SKU first, then alias as a fallback) and keeps only
 * rows that differ from the loaded levels. The server re-validates everything under row locks.
 */
export const planInventoryImport = (
    rows: InventoryCsvRow[],
    levels: InventoryLevelView[],
    warehouses: Warehouse[],
): InventoryImportPlan => {
    const errors: string[] = [];
    const warehouseByCode = new Map(warehouses.map((warehouse) => [warehouse.code.toUpperCase(), warehouse]));
    const variantBySku = new Map<string, string>();
    const variantsByAlias = new Map<string, Set<string>>();
    const levelByKey = new Map<string, InventoryLevelView>();
    for (const level of levels) {
        variantBySku.set(level.sku.toUpperCase(), level.variantId);
        const alias = level.alias?.trim().toUpperCase();
        if (alias) variantsByAlias.set(alias, (variantsByAlias.get(alias) ?? new Set()).add(level.variantId));
        levelByKey.set(`${level.warehouseId}::${level.variantId}`, level);
    }

    const changes: InventoryImportChange[] = [];
    const resolvedRow = new Map<string, number>();
    let unchanged = 0;
    for (const row of rows) {
        const prefix = `Row ${row.sourceRow}`;
        const warehouse = warehouseByCode.get(row.warehouse_code.trim().toUpperCase());
        if (!warehouse) errors.push(`${prefix}: warehouse_code “${row.warehouse_code}” does not exist.`);
        const reference = row.sku.trim().toUpperCase();
        let variantId = variantBySku.get(reference);
        if (!variantId) {
            const aliasMatches = variantsByAlias.get(reference);
            if (aliasMatches && aliasMatches.size > 1) {
                errors.push(`${prefix}: “${row.sku}” matches the alias of ${aliasMatches.size} variants — use the SKU instead.`);
                continue;
            }
            variantId = aliasMatches ? [...aliasMatches][0] : undefined;
        }
        if (!variantId) {
            errors.push(
                `${prefix}: sku “${row.sku}” matches no SKU or alias.${/^\d+$/.test(row.sku) ? ' If the SKU starts with 0, your spreadsheet may have dropped the leading zeros.' : ''}`,
            );
        }
        if (!warehouse || !variantId) continue;

        const key = `${warehouse.id}::${variantId}`;
        const earlier = resolvedRow.get(key);
        if (earlier !== undefined) {
            errors.push(`${prefix}: refers to the same warehouse and variant as row ${earlier}.`);
            continue;
        }
        resolvedRow.set(key, row.sourceRow);

        const onHand = Number(row.on_hand);
        const lowStockThreshold = Number(row.low_stock_threshold);
        const level = levelByKey.get(key);
        if (level && level.onHand === onHand && level.lowStockThreshold === lowStockThreshold) {
            unchanged += 1;
            continue;
        }
        changes.push({
            sourceRow: row.sourceRow,
            warehouseId: warehouse.id,
            variantId,
            onHand,
            lowStockThreshold,
            ...(row.exported_on_hand ? { expectedOnHand: Number(row.exported_on_hand) } : {}),
        });
    }
    if (changes.length > MAX_INVENTORY_IMPORT_ROWS) {
        errors.push(`This file changes ${changes.length} rows; import at most ${MAX_INVENTORY_IMPORT_ROWS} at a time.`);
    }
    return { changes, unchanged, errors };
};
