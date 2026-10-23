import { describe, expect, it } from 'vitest';
import type { InventoryLevelView, Warehouse } from '../types';
import { inventoryCsvExport, inventoryCsvTemplate, parseInventoryCsv, planInventoryImport, validateInventoryCsvRows } from './inventory-csv';

const warehouse: Warehouse = { id: 'wh-1', code: 'MAIN', name: 'Main', isActive: true };
const level = (overrides: Partial<InventoryLevelView>): InventoryLevelView => ({
    id: 'level-1',
    warehouseId: 'wh-1',
    variantId: 'variant-1',
    onHand: 10,
    reserved: 0,
    lowStockThreshold: 2,
    sku: 'GHC-SET',
    alias: null,
    productId: 'product-1',
    productName: 'Serving Set',
    color: null,
    colorHex: null,
    thumbnailUrl: null,
    variantIsActive: true,
    warehouseCode: 'MAIN',
    warehouseName: 'Main',
    warehouseIsActive: true,
    ...overrides,
});

describe('inventory CSV', () => {
    it('exports and parses warehouse inventory rows with the exported on-hand guard', () => {
        const [row] = parseInventoryCsv(inventoryCsvExport([{ warehouseCode: 'MAIN', sku: 'GHC-SET', onHand: 24, lowStockThreshold: 4 }]));
        expect(row).toMatchObject({ warehouse_code: 'MAIN', sku: 'GHC-SET', on_hand: '24', low_stock_threshold: '4', exported_on_hand: '24' });
    });

    it('provides a valid import template and catches unsafe stock values', () => {
        const template = parseInventoryCsv(inventoryCsvTemplate());
        expect(validateInventoryCsvRows(template)).toEqual([]);
        expect(template[0].exported_on_hand).toBeUndefined();
        const [row] = template;
        expect(validateInventoryCsvRows([{ ...row, on_hand: '-1', low_stock_threshold: '2.5', exported_on_hand: 'x', sourceRow: 2 }])).toEqual([
            'Row 2: on_hand must be a whole number of zero or more.',
            'Row 2: low_stock_threshold must be a whole number of zero or more.',
            'Row 2: exported_on_hand must be a whole number of zero or more (or left empty).',
        ]);
    });

    it('plans only changed rows, matching SKU first and alias as a fallback', () => {
        const levels = [
            level({}),
            level({ id: 'level-2', variantId: 'variant-2', sku: 'GHC-CUP', alias: 'Sage cup', onHand: 3 }),
        ];
        const rows = parseInventoryCsv(
            'warehouse_code,sku,on_hand,low_stock_threshold,exported_on_hand\r\nmain,ghc-set,10,2,10\r\nMAIN,sage cup,7,1,3\r\n',
        );
        expect(planInventoryImport(rows, levels, [warehouse])).toEqual({
            changes: [{ sourceRow: 3, warehouseId: 'wh-1', variantId: 'variant-2', onHand: 7, lowStockThreshold: 1, expectedOnHand: 3 }],
            unchanged: 1,
            errors: [],
        });
    });

    it('reports unknown references, ambiguous aliases and leading-zero risks', () => {
        const levels = [level({ alias: 'Gold' }), level({ id: 'level-2', variantId: 'variant-2', sku: 'GHC-CUP', alias: 'gold' })];
        const rows = parseInventoryCsv('warehouse_code,sku,on_hand,low_stock_threshold\r\nEAST,GHC-SET,1,1\r\nMAIN,GOLD,1,1\r\nMAIN,1234,1,1\r\n');
        expect(planInventoryImport(rows, levels, [warehouse]).errors).toEqual([
            'Row 2: warehouse_code “EAST” does not exist.',
            'Row 3: “GOLD” matches the alias of 2 variants — use the SKU instead.',
            'Row 4: sku “1234” matches no SKU or alias. If the SKU starts with 0, your spreadsheet may have dropped the leading zeros.',
        ]);
    });

    it('catches a SKU row and an alias row that resolve to the same variant', () => {
        const levels = [level({ alias: 'Set' })];
        const rows = parseInventoryCsv('warehouse_code,sku,on_hand,low_stock_threshold\r\nMAIN,GHC-SET,1,1\r\nMAIN,set,2,1\r\n');
        expect(planInventoryImport(rows, levels, [warehouse]).errors).toEqual(['Row 3: refers to the same warehouse and variant as row 2.']);
    });
});
