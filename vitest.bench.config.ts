import codspeedPlugin from '@codspeed/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [codspeedPlugin()],
  test: {
    include: ['benchmarks/**/*.bench.ts'],
    environment: 'node',
    globals: false,
    pool: 'forks',
    isolate: true,
  },
});
