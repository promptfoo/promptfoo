import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  target: 'es2022',
  platform: 'neutral',
  fixedExtension: false,
  dts: true,
  deps: { neverBundle: ['zod'] },
});
