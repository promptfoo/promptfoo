import { fileURLToPath } from 'node:url';

import { defineConfig } from 'tsdown';

const packageRoot = fileURLToPath(new URL('.', import.meta.url));
const packageEntry = fileURLToPath(new URL('./src/index.ts', import.meta.url));
const esmOutDir = fileURLToPath(new URL('./dist/esm', import.meta.url));
const cjsOutDir = fileURLToPath(new URL('./dist/cjs', import.meta.url));

const sharedConfig = {
  cwd: packageRoot,
  entry: [packageEntry],
  target: 'es2022',
  treeshake: true,
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: [/^[a-z@][^:]*/],
  },
};

export default defineConfig([
  {
    ...sharedConfig,
    format: ['esm'],
    outDir: esmOutDir,
    fixedExtension: false,
    dts: true,
  },
  {
    ...sharedConfig,
    format: ['cjs'],
    outDir: cjsOutDir,
    fixedExtension: true,
    dts: false,
  },
]);
