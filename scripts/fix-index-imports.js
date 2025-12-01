#!/usr/bin/env node
/**
 * Auto-fix directory imports to include /index
 *
 * Transforms:
 *   import { foo } from './types';  ⟶  import { foo } from './types/index';
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');
const TEST_DIR = path.join(__dirname, '..', 'test');

// Regex to match relative imports without file extensions or /index
const DIRECTORY_IMPORT_REGEX = /from\s+(['"])(\.\.[\/\\][^'"]+|\.\/[^'"]+)\1/g;

function hasFileExtension(importPath) {
  return /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/.test(importPath);
}

function endsWithIndex(importPath) {
  return /\/index$/.test(importPath) || /\\index$/.test(importPath);
}

function isDirectoryImport(importPath) {
  return (
    (importPath.startsWith('./') || importPath.startsWith('../')) &&
    !hasFileExtension(importPath) &&
    !endsWithIndex(importPath)
  );
}

function fixFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  let fixCount = 0;

  const newContent = content.replace(DIRECTORY_IMPORT_REGEX, (match, quote, importPath) => {
    if (!isDirectoryImport(importPath)) {
      return match;
    }

    // Check if it's actually a directory by looking for index.ts
    const absolutePath = path.resolve(path.dirname(filePath), importPath);
    const possibleIndexFiles = [
      `${absolutePath}/index.ts`,
      `${absolutePath}/index.tsx`,
      `${absolutePath}/index.js`,
    ];
    const possibleFiles = [`${absolutePath}.ts`, `${absolutePath}.tsx`, `${absolutePath}.js`];

    const hasIndex = possibleIndexFiles.some((f) => fs.existsSync(f));
    const isFile = possibleFiles.some((f) => fs.existsSync(f));

    if (hasIndex && !isFile) {
      modified = true;
      fixCount++;
      return `from ${quote}${importPath}/index${quote}`;
    }

    return match;
  });

  if (modified) {
    fs.writeFileSync(filePath, newContent, 'utf8');
  }

  return fixCount;
}

function getAllTypeScriptFiles(dir) {
  const files = [];

  function walk(directory) {
    const entries = fs.readdirSync(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        if (['node_modules', 'dist', 'build', '.git'].includes(entry.name)) {
          continue;
        }
        walk(fullPath);
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

function main() {
  let totalFixed = 0;
  let filesModified = 0;

  console.log('🔧 Fixing directory imports...\n');

  // Fix src directory
  if (fs.existsSync(SRC_DIR)) {
    const srcFiles = getAllTypeScriptFiles(SRC_DIR);
    srcFiles.forEach((file) => {
      const fixes = fixFile(file);
      if (fixes > 0) {
        const relativePath = path.relative(process.cwd(), file);
        console.log(`  ✓ ${relativePath} (${fixes} fix${fixes === 1 ? '' : 'es'})`);
        totalFixed += fixes;
        filesModified++;
      }
    });
  }

  // Fix test directory
  if (fs.existsSync(TEST_DIR)) {
    const testFiles = getAllTypeScriptFiles(TEST_DIR);
    testFiles.forEach((file) => {
      const fixes = fixFile(file);
      if (fixes > 0) {
        const relativePath = path.relative(process.cwd(), file);
        console.log(`  ✓ ${relativePath} (${fixes} fix${fixes === 1 ? '' : 'es'})`);
        totalFixed += fixes;
        filesModified++;
      }
    });
  }

  if (totalFixed === 0) {
    console.log('✅ No fixes needed - all imports already include /index\n');
  } else {
    console.log(`\n✅ Fixed ${totalFixed} import(s) across ${filesModified} file(s)\n`);
  }

  process.exit(0);
}

main();
