import { AppRole, OperationsSnapshot } from '../types';

export type AdminSection =
    | 'overview'
    | 'orders'
    | 'catalogue'
    | 'inventory'
    | 'promotions'
    | 'users'
    | 'audit-logs'
    | 'operations';

/** Every admin page, in navigation order. Keep the roles in step with the backend @Roles guards. */
export const ADMIN_SECTIONS: ReadonlyArray<{ section: AdminSection; path: string; roles: readonly AppRole[] }> = [
    { section: 'overview', path: '/admin', roles: ['ADMIN'] },
    { section: 'orders', path: '/admin/orders', roles: ['ADMIN', 'SUPPORT_AGENT', 'WAREHOUSE_MANAGER'] },
    { section: 'catalogue', path: '/admin/catalogue', roles: ['ADMIN', 'CATALOGUE_MANAGER'] },
    { section: 'inventory', path: '/admin/inventory', roles: ['ADMIN', 'WAREHOUSE_MANAGER'] },
    { section: 'promotions', path: '/admin/promotions', roles: ['ADMIN', 'CATALOGUE_MANAGER'] },
    { section: 'users', path: '/admin/users', roles: ['ADMIN'] },
    { section: 'audit-logs', path: '/admin/audit-logs', roles: ['ADMIN'] },
    { section: 'operations', path: '/admin/operations', roles: ['ADMIN'] },
];

/** The admin page for an exact path (a trailing slash is ignored); null for unknown /admin/* paths. */
export const matchAdminSection = (pathname: string) => {
    const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    return ADMIN_SECTIONS.find((entry) => entry.path === path) ?? null;
};

export const canOpenAdminSection = (roles: readonly AppRole[], path: string): boolean => {
    const entry = matchAdminSection(path);
    return Boolean(entry?.roles.some((role) => roles.includes(role)));
};

/** The first admin page the roles can open, or null when they hold no staff role. */
export const defaultAdminPath = (roles: readonly AppRole[]): string | null =>
    ADMIN_SECTIONS.find((entry) => entry.roles.some((role) => roles.includes(role)))?.path ?? null;

/** True when `next` points at a page inside the admin workspace (query string allowed). */
export const isAdminPath = (path: string): boolean => {
    const pathname = path.split(/[?#]/)[0];
    return pathname === '/admin' || pathname.startsWith('/admin/');
};

export type HealthTone = 'ok' | 'warning' | 'critical';

export interface HealthSummary {
    tone: HealthTone;
    label: string;
}

/** Counters that indicate a broken flow. Low stock and the lifetime 5xx counter are shown but are not outages. */
const issueCounters = [
    'failedWebhooks',
    'terminalJobFailures',
    'expiredPendingPayments',
    'paymentMismatches',
    'failedRefunds',
] as const satisfies ReadonlyArray<keyof OperationsSnapshot>;

/** A one-line health message that only claims what the snapshot actually shows. */
export const operationsHealth = (snapshot: OperationsSnapshot): HealthSummary => {
    if (!snapshot.databaseHealthy) return { tone: 'critical', label: 'Database unreachable' };
    const counts = issueCounters.map((key) => snapshot[key]);
    if (counts.some((value) => value < 0)) return { tone: 'warning', label: 'Some checks unavailable' };
    const issues = counts.filter((value) => value > 0).length;
    if (issues) return { tone: 'warning', label: `${issues} ${issues === 1 ? 'check needs' : 'checks need'} attention` };
    return { tone: 'ok', label: 'All systems online' };
};
