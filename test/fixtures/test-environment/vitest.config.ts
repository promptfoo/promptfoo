import { defineConfig } from 'vitest/config';
import config from '../../../vitest.config';

export default defineConfig({
  ...config,
  test: {
    ...config.test,
    include: ['test/fixtures/test-environment/worker.ts'],
    maxWorkers: 1,
  },
});
