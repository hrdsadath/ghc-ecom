import { AuditLog } from '../types';
import { rupees } from './commerce';

export interface AuditChangeRow {
    field: string;
    before: string;
    after: string;
}

export interface AuditFactRow {
    field: string;
    value: string;
}

const entityLabels: Record<string, string> = {
    category: 'Category',
    product: 'Product',
    product_variant: 'Product combination',
    product_image: 'Product image',
    product_video: 'Product video',
    inventory_level: 'Inventory level',
    warehouse: 'Warehouse',
    coupon: 'Coupon',
    order: 'Order',
    refund: 'Refund',
    shipment: 'Shipment',
    return: 'Return',
    user: 'Team member',
};

/** Entity types offered as an activity-log filter. */
export const auditEntityTypeOptions = Object.entries(entityLabels)
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));

/** Actions whose generic "<entity> <verb>" label would be misleading. */
const actionLabels: Record<string, string> = {
    'user.role.assigned': 'Staff role granted',
    'user.role.removed': 'Staff role removed',
    'auth.staff.signed_in': 'Staff sign-in',
    'user.suspended': 'Staff account suspended',
    'user.reinstated': 'Staff account reinstated',
    'user.password_reset.sent': 'Password reset email sent',
};

const roleLabels: Record<string, string> = {
    ADMIN: 'Administrator',
    CATALOGUE_MANAGER: 'Catalogue manager',
    WAREHOUSE_MANAGER: 'Warehouse manager',
    SUPPORT_AGENT: 'Support agent',
    CUSTOMER: 'Customer',
};

const fieldLabels: Record<string, string> = {
    pricePaise: 'Price',
    compareAtPricePaise: 'Compare-at price',
    isActive: 'Active',
    isPublished: 'Published',
    categoryId: 'Category',
    color: 'Colour',
    colorHex: 'Colour hex',
    size: 'Size',
    packQuantity: 'Pack quantity',
    variantIds: 'Assigned combinations',
    entityLabel: 'Record',
    lowStockThreshold: 'Low-stock threshold',
    onHand: 'On hand',
    parentId: 'Parent category',
    sortOrder: 'Sort order',
};

const recordValue = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;

export const auditFieldLabel = (field: string): string => {
    if (fieldLabels[field]) return fieldLabels[field];
    const spaced = field.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
};

export const auditValue = (field: string, value: unknown): string => {
    if (value === null || value === undefined || value === '') return 'None';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number' && /paise$/i.test(field)) return rupees(value);
    if (typeof value === 'string' && /^roles?$/.test(field) && roleLabels[value]) return roleLabels[value];
    if (Array.isArray(value)) return value.map((item) => auditValue(field, item)).join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value).replace(/_/g, ' ');
};

export const auditActionLabel = (log: AuditLog): string => {
    if (actionLabels[log.action]) return actionLabels[log.action];
    const entity = entityLabels[log.entityType] || auditFieldLabel(log.entityType);
    const verb = log.action.split('.').at(-1)?.replace(/_/g, ' ') || 'changed';
    return `${entity} ${verb}`;
};

export const auditEntityLabel = (log: AuditLog): string => {
    const label = log.metadata?.entityLabel;
    if (typeof label === 'string' && label.trim()) return label.trim();
    return entityLabels[log.entityType] || auditFieldLabel(log.entityType);
};

export const auditChangeRows = (log: AuditLog): AuditChangeRow[] => {
    const changes = recordValue(log.metadata?.changes);
    if (changes) {
        return Object.entries(changes).flatMap(([field, value]) => {
            const change = recordValue(value);
            if (!change || (!('before' in change) && !('after' in change))) return [];
            return [{
                field: auditFieldLabel(field),
                before: auditValue(field, change.before),
                after: auditValue(field, change.after),
            }];
        });
    }
    if (log.metadata && ('from' in log.metadata || 'to' in log.metadata)) {
        return [{
            field: 'Status',
            before: auditValue('status', log.metadata.from),
            after: auditValue('status', log.metadata.to),
        }];
    }
    return [];
};

export const auditFactRows = (log: AuditLog): AuditFactRow[] => {
    const ignored = new Set(['entityLabel', 'changes', 'from', 'to']);
    // The email is already shown as the record name.
    if (log.metadata?.email === log.metadata?.entityLabel) ignored.add('email');
    return Object.entries(log.metadata || {})
        .filter(([field]) => !ignored.has(field))
        .map(([field, value]) => ({ field: auditFieldLabel(field), value: auditValue(field, value) }));
};
