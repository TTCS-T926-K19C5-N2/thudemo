import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { config } from 'dotenv';
import { resolve } from 'node:path';

// Only load fallback env if DATABASE_URL is not already provided by external environment
if (!process.env.DATABASE_URL) {
  config({ path: resolve(import.meta.dirname, '.env.test') });
  config({ path: resolve(import.meta.dirname, '.env') });
}

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ||
        'postgresql://postgres:postgres@localhost:5432/sprint2_integration?schema=public',
    },
  },
});
