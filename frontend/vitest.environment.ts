import type { Environment } from 'vitest/runtime';
import { builtinEnvironments } from 'vitest/runtime';

/**
 * jsdom environment that also exposes jsdom's Web Storage on the test global.
 *
 * Node 25+ defines `localStorage`/`sessionStorage` on `globalThis` itself (they stay
 * `undefined` unless Node is started with `--localstorage-file`). Vitest's built-in
 * jsdom environment never overrides globals that already exist, so on those Node
 * versions every test touching storage fails. This wrapper installs jsdom's storage
 * regardless of the host Node version and restores the originals on teardown.
 */
const STORAGE_KEYS = ['localStorage', 'sessionStorage'] as const;

type TestGlobal = typeof globalThis & { jsdom?: { window: Window } };

const environment: Environment = {
    name: 'jsdom-with-storage',
    viteEnvironment: 'client',
    async setup(global: TestGlobal, options) {
        const jsdom = await builtinEnvironments.jsdom.setup(global, options);
        const window = global.jsdom?.window;
        const originals = new Map<string, PropertyDescriptor | undefined>();

        if (window) {
            for (const key of STORAGE_KEYS) {
                originals.set(key, Object.getOwnPropertyDescriptor(global, key));
                Object.defineProperty(global, key, {
                    configurable: true,
                    enumerable: true,
                    get: () => window[key],
                });
            }
        }

        return {
            async teardown(teardownGlobal: TestGlobal) {
                for (const [key, descriptor] of originals) {
                    if (descriptor) Object.defineProperty(teardownGlobal, key, descriptor);
                    else delete (teardownGlobal as Record<string, unknown>)[key];
                }
                await jsdom.teardown(teardownGlobal);
            },
        };
    },
};

export default environment;
