import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  target: 'es2022',
  platform: 'neutral',
  fixedExtension: false,
  dts: true,
  // Keep bare imports external so build dependencies cannot hide undeclared runtime imports.
  deps: { neverBundle: /^[a-z@][^:]*/ },
});
