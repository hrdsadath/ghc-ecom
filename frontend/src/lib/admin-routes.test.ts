import { describe, expect, it } from 'vitest';
import { canOpenAdminSection, defaultAdminPath, isAdminPath, matchAdminSection, operationsHealth } from './admin-routes';
import { OperationsSnapshot } from '../types';

const healthy: OperationsSnapshot = {
    databaseHealthy: true,
    apiServerErrorsTotal: 12,
    failedWebhooks: 0,
    terminalJobFailures: 0,
    expiredPendingPayments: 0,
    paymentMismatches: 0,
    failedRefunds: 0,
    lowStockSkus: 4,
    checkedAt: '2026-10-11T00:00:00.000Z',
};

describe('admin routes', () => {
    it('matches only known admin pages', () => {
        expect(matchAdminSection('/admin')?.section).toBe('overview');
        expect(matchAdminSection('/admin/orders/')?.section).toBe('orders');
        expect(matchAdminSection('/admin/ordersx')).toBeNull();
        expect(matchAdminSection('/admin/does-not-exist')).toBeNull();
        expect(matchAdminSection('/admin/users/extra')).toBeNull();
    });

    it('sends each role to the first page it can open', () => {
        expect(defaultAdminPath(['ADMIN'])).toBe('/admin');
        expect(defaultAdminPath(['CATALOGUE_MANAGER'])).toBe('/admin/catalogue');
        expect(defaultAdminPath(['WAREHOUSE_MANAGER'])).toBe('/admin/orders');
        expect(defaultAdminPath(['SUPPORT_AGENT'])).toBe('/admin/orders');
        expect(defaultAdminPath(['CUSTOMER'])).toBeNull();
        expect(canOpenAdminSection(['SUPPORT_AGENT'], '/admin/inventory')).toBe(false);
        expect(canOpenAdminSection(['WAREHOUSE_MANAGER'], '/admin/inventory')).toBe(true);
    });

    it('accepts admin return paths with a query string', () => {
        expect(isAdminPath('/admin/orders?status=paid')).toBe(true);
        expect(isAdminPath('/admin')).toBe(true);
        expect(isAdminPath('/administrator')).toBe(false);
        expect(isAdminPath('/account')).toBe(false);
    });
});

describe('operations health', () => {
    it('only reports all systems online when every check passed', () => {
        expect(operationsHealth(healthy)).toEqual({ tone: 'ok', label: 'All systems online' });
        expect(operationsHealth({ ...healthy, databaseHealthy: false, failedWebhooks: -1 }).tone).toBe('critical');
        expect(operationsHealth({ ...healthy, failedRefunds: -1 })).toEqual({ tone: 'warning', label: 'Some checks unavailable' });
        expect(operationsHealth({ ...healthy, failedWebhooks: 2, paymentMismatches: 1 })).toEqual({
            tone: 'warning',
            label: '2 checks need attention',
        });
    });
});
