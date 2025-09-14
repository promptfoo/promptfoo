#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function revertImportsInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Revert .js back to no extension for relative imports
  const originalContent = content;

  // Pattern to match relative imports with .js extension
  content = content.replace(
    /from\s+(['"])(\.{1,2}\/[^'"]*?)\.js\1/g,
    (match, quote, importPath) => {
      modified = true;
      console.log(`${filePath}: Reverting ${importPath}.js -> ${importPath}`);
      return `from ${quote}${importPath}${quote}`;
    }
  );

  // Also handle import statements with .js
  content = content.replace(
    /import\s+([^'"]*)from\s+(['"])(\.{1,2}\/[^'"]*?)\.js\2/g,
    (match, importClause, quote, importPath) => {
      modified = true;
      console.log(`${filePath}: Reverting import ${importPath}.js -> ${importPath}`);
      return `import ${importClause}from ${quote}${importPath}${quote}`;
    }
  );

  // Handle export statements with .js
  content = content.replace(
    /export\s+([^'"]*)from\s+(['"])(\.{1,2}\/[^'"]*?)\.js\2/g,
    (match, exportClause, quote, importPath) => {
      modified = true;
      console.log(`${filePath}: Reverting export ${importPath}.js -> ${importPath}`);
      return `export ${exportClause}from ${quote}${importPath}${quote}`;
    }
  );

  // Handle jest.mock() and jest.requireActual() with .js extensions
  content = content.replace(
    /jest\.(mock|requireActual)\((['"])(\.{1,2}\/[^'"]*?)\.js\2/g,
    (match, method, quote, importPath) => {
      modified = true;
      console.log(`${filePath}: Reverting jest.${method} ${importPath}.js -> ${importPath}`);
      return `jest.${method}(${quote}${importPath}${quote}`;
    }
  );

  if (modified) {
    fs.writeFileSync(filePath, content);
    return 1;
  }
  return 0;
}

function processDirectory(dir) {
  let totalFixed = 0;

  function traverse(currentDir) {
    const entries = fs.readdirSync(currentDir);

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        if (!['node_modules', 'dist', '.git', 'site'].includes(entry)) {
          traverse(fullPath);
        }
      } else if (stat.isFile() && (entry.endsWith('.ts') || entry.endsWith('.tsx'))) {
        if (!entry.endsWith('.d.ts')) {
          totalFixed += revertImportsInFile(fullPath);
        }
      }
    }
  }

  traverse(dir);
  return totalFixed;
}

// Process both src and test directories
const srcFixed = processDirectory('src');
const testFixed = processDirectory('test');
const totalFixed = srcFixed + testFixed;

console.log(`\nReverted .js extensions in ${totalFixed} files (${srcFixed} in src/, ${testFixed} in test/).`);