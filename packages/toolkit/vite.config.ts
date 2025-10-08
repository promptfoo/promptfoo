import { readFileSync } from 'fs';
import { resolve } from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

// Read package.json to get all dependencies
const packageJson = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));
const allDeps = {
  ...packageJson.dependencies,
  ...packageJson.peerDependencies,
  ...packageJson.devDependencies,
};
const externalDeps = Object.keys(allDeps);

// Generate globals mapping for UMD builds
const generateGlobals = (deps: string[]) => {
  const globals: Record<string, string> = {};
  deps.forEach((dep) => {
    // Convert package names to global variable names
    const globalName = dep
      .replace(/^@/, '') // Remove @ prefix
      .replace(/[\/\-]/g, '') // Remove slashes and hyphens
      .replace(/([a-z])([A-Z])/g, '$1$2') // Handle camelCase
      .replace(/^[a-z]/, (match) => match.toUpperCase()); // Capitalize first letter

    globals[dep] = globalName;
  });
  return globals;
};

const globalsMapping = generateGlobals(externalDeps);

export default defineConfig({
  plugins: [
    react(),
    // @ts-expect-error - dts plugin is not typed
    dts({
      insertTypesEntry: true,
      include: ['src/**/*'],
      exclude: ['src/**/*.stories.*', 'src/**/*.test.*'],
      outDir: 'dist',
      rollupTypes: true,
      compilerOptions: {
        declaration: true,
        emitDeclarationOnly: false,
        declarationMap: true,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    globals: true,
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'PromptfooToolkit',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'mjs' : 'cjs'}`,
    },
    rollupOptions: {
      external: externalDeps,
      output: [
        {
          format: 'es',
          entryFileNames: 'index.mjs',
          assetFileNames: 'style.css',
          globals: globalsMapping,
        },
        {
          format: 'cjs',
          entryFileNames: 'index.cjs',
          assetFileNames: 'style.css',
          globals: globalsMapping,
        },
      ],
    },
    cssCodeSplit: false,
  },
});
