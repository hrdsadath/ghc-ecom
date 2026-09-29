import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom plus Web Storage globals; see vitest.environment.ts for why.
    environment: './vitest.environment.ts',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
