#!/usr/bin/env node
/**
 * Enforce explicit /index in directory imports
 *
 * Requires:
 *   import { foo } from './types/index';  ✅
 * Disallows:
 *   import { foo } from './types';  ❌
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');
const TEST_DIR = path.join(__dirname, '..', 'test');

// Regex to match relative imports without file extensions or /index
// Matches: from './foo' or from '../bar' but NOT './foo.ts' or './foo/index'
const DIRECTORY_IMPORT_REGEX = /from\s+['"](\.\.[\/\\][^'"]+|\.\/[^'"]+)['"]/g;

function hasFileExtension(importPath) {
  return /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/.test(importPath);
}

function endsWithIndex(importPath) {
  return /\/index$/.test(importPath) || /\\index$/.test(importPath);
}

function isDirectoryImport(importPath) {
  // Relative import without extension and without /index
  return (
    (importPath.startsWith('./') || importPath.startsWith('../')) &&
    !hasFileExtension(importPath) &&
    !endsWithIndex(importPath)
  );
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const violations = [];

  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const matches = [...line.matchAll(DIRECTORY_IMPORT_REGEX)];
    matches.forEach((m) => {
      const importPath = m[1];

      if (isDirectoryImport(importPath)) {
        // Check if it's actually a directory by looking for index.ts
        const absolutePath = path.resolve(path.dirname(filePath), importPath);
        const possibleIndexFiles = [
          `${absolutePath}/index.ts`,
          `${absolutePath}/index.tsx`,
          `${absolutePath}/index.js`,
          `${absolutePath}.ts`,
          `${absolutePath}.tsx`,
          `${absolutePath}.js`,
        ];

        // If index file exists, this is a directory import that needs /index
        const hasIndex = possibleIndexFiles.slice(0, 3).some((f) => fs.existsSync(f));
        const isFile = possibleIndexFiles.slice(3).some((f) => fs.existsSync(f));

        if (hasIndex && !isFile) {
          violations.push({
            line: idx + 1,
            importPath,
            suggestion: `${importPath}/index`,
            text: line.trim(),
          });
        }
      }
    });
  });

  return violations;
}

function getAllTypeScriptFiles(dir) {
  const files = [];

  function walk(directory) {
    const entries = fs.readdirSync(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules, dist, build
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
  const allViolations = [];

  // Check src directory
  if (fs.existsSync(SRC_DIR)) {
    const srcFiles = getAllTypeScriptFiles(SRC_DIR);
    srcFiles.forEach((file) => {
      const violations = checkFile(file);
      if (violations.length > 0) {
        allViolations.push({ file, violations });
      }
    });
  }

  // Check test directory
  if (fs.existsSync(TEST_DIR)) {
    const testFiles = getAllTypeScriptFiles(TEST_DIR);
    testFiles.forEach((file) => {
      const violations = checkFile(file);
      if (violations.length > 0) {
        allViolations.push({ file, violations });
      }
    });
  }

  if (allViolations.length === 0) {
    console.log('✅ All directory imports include /index');
    process.exit(0);
  }

  console.error('\n❌ Directory imports must include /index:\n');

  allViolations.forEach(({ file, violations }) => {
    const relativePath = path.relative(process.cwd(), file);
    violations.forEach((v) => {
      console.error(`  ${relativePath}:${v.line}`);
      console.error(`    Current:   from '${v.importPath}'`);
      console.error(`    Required:  from '${v.suggestion}'`);
      console.error(`    Line:      ${v.text}\n`);
    });
  });

  const totalCount = allViolations.reduce((sum, { violations }) => sum + violations.length, 0);
  console.error(`\nFound ${totalCount} violation(s) across ${allViolations.length} file(s)\n`);

  process.exit(1);
}

main();
