import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/holds/holds.service.ts',
        'src/prisma/prisma.service.ts',
        'src/prisma/hold-transaction.ts',
      ],
      reporter: ['json', 'json-summary', 'text'],
      reportsDirectory: 'coverage/sprint1-foundation',
    },
  },
});
