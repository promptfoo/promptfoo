#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Node.js built-in modules that should use node: prefix
const NODE_MODULES = [
  'assert',
  'buffer',
  'child_process',
  'cluster',
  'crypto',
  'dgram',
  'dns',
  'events',
  'fs',
  'http',
  'https',
  'net',
  'os',
  'path',
  'process',
  'querystring',
  'readline',
  'stream',
  'timers',
  'tls',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'worker_threads',
  'zlib',
];

const NODE_MODULES_REGEX = new RegExp(
  `(import\\s+(?:[\\w\\s{},*]+\\s+)?(?:from\\s+)?['"])(?!node:)(${NODE_MODULES.join('|')})(/[^'"]*)?(['"])`,
  'g',
);

const NODE_MODULES_REQUIRE_REGEX = new RegExp(
  `(require\\s*\\(['"])(?!node:)(${NODE_MODULES.join('|')})(/[^'"]*)?(['"]\\))`,
  'g',
);

function fixNodeImportsInFile(filePath) {
  if (!filePath.endsWith('.ts') && !filePath.endsWith('.js') && !filePath.endsWith('.mjs')) {
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Fix ES module imports
  const newContent = content.replace(
    NODE_MODULES_REGEX,
    (match, prefix, moduleName, subPath, suffix) => {
      modified = true;
      return `${prefix}node:${moduleName}${subPath || ''}${suffix}`;
    },
  );

  // Also fix any require statements (for compatibility)
  const finalContent = newContent.replace(
    NODE_MODULES_REQUIRE_REGEX,
    (match, prefix, moduleName, subPath, suffix) => {
      modified = true;
      return `${prefix}node:${moduleName}${subPath || ''}${suffix}`;
    },
  );

  if (modified) {
    fs.writeFileSync(filePath, finalContent, 'utf8');
    console.log(`Fixed imports in: ${filePath}`);
  }
}

function walkDirectory(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Skip node_modules and dist directories
      if (file === 'node_modules' || file === 'dist' || file === '.git') {
        continue;
      }
      walkDirectory(filePath);
    } else {
      fixNodeImportsInFile(filePath);
    }
  }
}

// Start from project root
const projectRoot = path.resolve(__dirname, '..');
walkDirectory(path.join(projectRoot, 'src'));
walkDirectory(path.join(projectRoot, 'test'));
fixNodeImportsInFile(path.join(projectRoot, 'tsup.config.ts'));
fixNodeImportsInFile(path.join(projectRoot, 'jest.config.ts'));

console.log('Node.js imports fixed!');
