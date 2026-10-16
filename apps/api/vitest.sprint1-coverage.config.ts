import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config.js';
import { fileURLToPath } from 'node:url';
export default mergeConfig(
  base,
  defineConfig({
    test: {
      coverage: {
        provider: 'v8',
        allowExternal: true,
        reporter: ['json', 'json-summary', 'text'],
        reportsDirectory:
          process.env.SPRINT1_COVERAGE_DIR ?? './coverage/sprint1',
        include: [
          'src/auth/auth.service.ts',
          'src/auth/auth.controller.ts',
          'src/redis/redis.service.ts',
          fileURLToPath(
            new URL('../../packages/shared/login-peer.js', import.meta.url),
          ).replaceAll('\\', '/'),
        ],
        exclude: [],
      },
    },
  }),
);
