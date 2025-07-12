#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'fs/promises';
import { join, resolve, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const distEsmDir = resolve(__dirname, '..', 'dist', 'esm');

// Known packages that require .js extensions on their submodule imports
const packagesRequiringJs = [
  'semver/functions',
  'chalk/source',
  // Add more as discovered
];

async function* walk(dir) {
  const dirents = await readdir(dir, { withFileTypes: true });
  for (const dirent of dirents) {
    const res = resolve(dir, dirent.name);
    if (dirent.isDirectory()) {
      yield* walk(res);
    } else {
      yield res;
    }
  }
}

async function processFile(filePath) {
  if (!filePath.endsWith('.js')) return;
  
  let content = await readFile(filePath, 'utf-8');
  let modified = false;
  
  // Fix imports for known packages that require .js
  for (const packagePrefix of packagesRequiringJs) {
    // Match import patterns for this package
    const patterns = [
      new RegExp(`(from\\s+['"])(${packagePrefix}/[^'"]+)(['"])`, 'g'),
      new RegExp(`(import\\s*\\(['"])(${packagePrefix}/[^'"]+)(['"]\\))`, 'g')
    ];
    
    for (const pattern of patterns) {
      content = content.replace(pattern, (match, p1, p2, p3) => {
        if (!p2.endsWith('.js')) {
          return `${p1}${p2}.js${p3}`;
        }
        return match;
      });
    }
  }
  
  const originalContent = await readFile(filePath, 'utf-8');
  if (content !== originalContent) {
    await writeFile(filePath, content, 'utf-8');
    console.log(`Fixed package imports in ${relative(distEsmDir, filePath)}`);
    modified = true;
  }
}

async function main() {
  console.log('Fixing known package imports that require .js...');
  
  for await (const filePath of walk(distEsmDir)) {
    await processFile(filePath);
  }
  
  console.log('Done fixing package imports');
}

main().catch(console.error);