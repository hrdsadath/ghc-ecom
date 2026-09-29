import { describe, expect, it } from 'vitest';
import { safeInternalPath } from './navigation';

describe('safeInternalPath', () => {
    it('accepts an application-relative path with query and hash', () => {
        expect(safeInternalPath('/account/orders?tab=open#latest', '/account')).toBe(
            '/account/orders?tab=open#latest',
        );
    });

    it.each([
        'https://evil.example',
        '//evil.example/path',
        '/\\evil.example/path',
        '/%5cevil.example/path',
        'account',
    ])('rejects unsafe redirect target %s', (value) => {
        expect(safeInternalPath(value, '/account')).toBe('/account');
    });
});
