import { afterEach, describe, expect, it, vi } from 'vitest';
import { openTrustedUrl, openTrustedUrlFrom, safeInternalPath } from './navigation';

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

describe('openTrustedUrl', () => {
    afterEach(() => vi.restoreAllMocks());

    it('reports success for a trusted URL even though noopener windows return null', () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null);
        expect(openTrustedUrl('https://files.example/invoice.pdf')).toBe(true);
        expect(open).toHaveBeenCalledWith('https://files.example/invoice.pdf', '_blank', 'noopener,noreferrer');
    });

    it.each(['javascript:alert(1)', 'http://files.example/invoice.pdf', 'data:text/html,hi'])(
        'refuses to open %s',
        (value) => {
            const open = vi.spyOn(window, 'open').mockReturnValue(null);
            expect(openTrustedUrl(value)).toBe(false);
            expect(open).not.toHaveBeenCalled();
        },
    );
});

describe('openTrustedUrlFrom', () => {
    afterEach(() => vi.restoreAllMocks());

    const fakeTab = () => {
        const tab = { opener: {} as unknown, closed: false, close: vi.fn(), location: { replace: vi.fn() } };
        return tab;
    };

    it('opens a tab before the URL is fetched and then points it at the URL', async () => {
        const tab = fakeTab();
        const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
        let resolve!: (value: string) => void;
        const pending = openTrustedUrlFrom(() => new Promise<string>((done) => { resolve = done; }));

        expect(open).toHaveBeenCalledWith('', '_blank');
        expect(tab.opener).toBeNull();
        resolve('https://files.example/invoice.pdf');
        await pending;

        expect(tab.location.replace).toHaveBeenCalledWith('https://files.example/invoice.pdf');
        expect(tab.close).not.toHaveBeenCalled();
    });

    it('closes the tab and rejects when the URL cannot be fetched', async () => {
        const tab = fakeTab();
        vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);

        await expect(openTrustedUrlFrom(() => Promise.reject(new Error('Invoice is not ready')))).rejects.toThrow(
            'Invoice is not ready',
        );
        expect(tab.close).toHaveBeenCalled();
    });

    it('closes the tab and rejects an untrusted URL', async () => {
        const tab = fakeTab();
        vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);

        await expect(openTrustedUrlFrom(() => Promise.resolve('javascript:alert(1)'))).rejects.toThrow('rejected');
        expect(tab.location.replace).not.toHaveBeenCalled();
        expect(tab.close).toHaveBeenCalled();
    });

    it('falls back to a direct new tab when the blank tab was blocked', async () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null);

        await openTrustedUrlFrom(() => Promise.resolve('https://files.example/invoice.pdf'));

        expect(open).toHaveBeenLastCalledWith('https://files.example/invoice.pdf', '_blank', 'noopener,noreferrer');
    });
});
