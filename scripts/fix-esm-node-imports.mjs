#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'fs/promises';
import { join, resolve, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const distEsmDir = resolve(__dirname, '..', 'dist', 'esm');

// Node.js built-in modules that should use 'node:' prefix
const nodeBuiltins = [
  'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
  'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'https',
  'module', 'net', 'os', 'path', 'punycode', 'querystring', 'readline',
  'repl', 'stream', 'string_decoder', 'sys', 'timers', 'tls', 'tty',
  'url', 'util', 'vm', 'zlib', 'worker_threads', 'perf_hooks'
];

// Node.js submodules that need fixing
const nodeSubmodules = [
  'fs/promises', 'path/posix', 'path/win32', 'stream/promises',
  'stream/consumers', 'stream/web', 'util/types', 'timers/promises'
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
  
  // Fix Node.js built-in imports
  for (const builtin of nodeBuiltins) {
    // Match various import patterns
    const patterns = [
      new RegExp(`(from\\s+['"])${builtin}(['"])`, 'g'),
      new RegExp(`(import\\s*\\(['"])${builtin}(['"]\\))`, 'g'),
      new RegExp(`(require\\s*\\(['"])${builtin}(['"]\\))`, 'g')
    ];
    
    for (const pattern of patterns) {
      const newContent = content.replace(pattern, `$1node:${builtin}$2`);
      if (newContent !== content) {
        content = newContent;
        modified = true;
      }
    }
  }
  
  // Fix Node.js submodule imports (with or without .js extension)
  for (const submodule of nodeSubmodules) {
    const patterns = [
      new RegExp(`(from\\s+['"])${submodule}(\\.js)?(['"])`, 'g'),
      new RegExp(`(import\\s*\\(['"])${submodule}(\\.js)?(['"]\\))`, 'g')
    ];
    
    for (const pattern of patterns) {
      const newContent = content.replace(pattern, `$1node:${submodule}$3`);
      if (newContent !== content) {
        content = newContent;
        modified = true;
      }
    }
  }
  
  if (modified) {
    await writeFile(filePath, content, 'utf-8');
    console.log(`Fixed Node.js imports in ${relative(distEsmDir, filePath)}`);
  }
}

async function main() {
  console.log('Fixing Node.js built-in imports in ESM build...');
  
  for await (const filePath of walk(distEsmDir)) {
    await processFile(filePath);
  }
  
  console.log('Done fixing Node.js imports');
}

main().catch(console.error);