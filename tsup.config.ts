import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'tsup';
import { glob } from 'glob';
import { esbuildPluginFilePathExtensions } from 'esbuild-plugin-file-path-extensions';

async function copyStaticAssets() {
  const copies = [
    { src: 'src/*.html', dest: 'dist/src' },
    { src: 'src/python/wrapper.py', dest: 'dist/src/python/wrapper.py' },
    { src: 'src/golang/wrapper.go', dest: 'dist/src/golang/wrapper.go' },
    { src: 'drizzle', dest: 'dist/drizzle' },
  ];

  for (const { src, dest } of copies) {
    if (src.includes('*')) {
      // Handle glob patterns
      const files = fs.readdirSync('src').filter((f) => f.endsWith('.html'));
      for (const file of files) {
        const destPath = path.join(dest, file);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(path.join('src', file), destPath);
      }
    } else if (fs.existsSync(src)) {
      // Copy directory or file
      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        fs.cpSync(src, dest, { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      }
    }
  }
}

function generateConstants() {
  try {
    execSync('node scripts/generate-constants.mjs', { stdio: 'inherit' });
    console.log('Generated constants file');
  } catch (error) {
    console.error('Failed to generate constants:', error);
  }
}

// Get all TypeScript files from src directory
const entries = glob.sync(['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.d.ts', '!src/app/**/*']);

export default defineConfig({
  entry: entries,
  format: ['esm'],
  target: 'node20.10', // Use a version that supports 'with' syntax
  dts: {
    resolve: true,
    entry: ['src/main.ts', 'src/index.ts'],
  },
  clean: true,
  bundle: true,
  outDir: 'dist',
  splitting: false,
  treeshake: true,
  sourcemap: true,
  shims: true,
  external: [
    // All dependencies are external
    /^[^./]/,
    // Except relative imports
  ],
  esbuildPlugins: [
    esbuildPluginFilePathExtensions({
      esm: true,
      esmExtension: 'js',
    }),
  ],
  esbuildOptions(options) {
    // Add shebang to main entry
    if (options.entryPoints?.[0]?.includes('main.ts')) {
      options.banner = {
        js: '#!/usr/bin/env node\n',
      };
    }

    // Preserve import attributes for JSON files
    options.supported = {
      'import-attributes': true,
    };
  },
  async onSuccess() {
    console.log('Generating constants...');
    generateConstants();

    console.log('Copying static assets...');
    await copyStaticAssets();

    console.log('Fixing JSON imports...');
    execSync('node scripts/fix-json-imports.mjs', { stdio: 'inherit' });

    console.log('Fixing constants imports...');
    execSync('node scripts/fix-constants-imports.mjs', { stdio: 'inherit' });

    console.log('Building React app...');
    execSync('npm run build:app', { stdio: 'inherit' });

    console.log('Build complete!');
  },
});
