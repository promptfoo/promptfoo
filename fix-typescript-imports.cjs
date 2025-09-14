#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function fixImportsInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  const lines = content.split('\n');

  const modifiedLines = lines.map((line, lineIndex) => {
    // Match import/export statements with relative paths
    const importMatch = line.match(/^(\s*(?:import|export).*from\s+['\"])([^'\"]+)(['\"].*)$/);
    if (importMatch) {
      const [, prefix, importPath, suffix] = importMatch;

      // Only process relative imports that don't already have extensions
      if (
        (importPath.startsWith('./') || importPath.startsWith('../')) &&
        !/\.[jt]sx?$/.test(importPath) &&
        !importPath.endsWith('.json')
      ) {
        const baseDir = path.dirname(filePath);
        const resolvedPath = path.resolve(baseDir, importPath);

        let newImportPath = importPath;

        // Check if this is a directory import
        if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
          // Check if there's an index.ts or index.tsx file
          const indexTs = path.join(resolvedPath, 'index.ts');
          const indexTsx = path.join(resolvedPath, 'index.tsx');

          if (fs.existsSync(indexTs) || fs.existsSync(indexTsx)) {
            newImportPath = importPath + '/index.js';
          } else {
            // If no index file, assume it's a regular import
            newImportPath = importPath + '.js';
          }
        } else {
          // File import - add .js extension
          newImportPath = importPath + '.js';
        }

        if (newImportPath !== importPath) {
          modified = true;
          console.log(`${filePath}:${lineIndex + 1}: ${importPath} -> ${newImportPath}`);
          return prefix + newImportPath + suffix;
        }
      }
    }

    return line;
  });

  if (modified) {
    fs.writeFileSync(filePath, modifiedLines.join('\n'));
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
        // Skip node_modules and dist directories
        if (!['node_modules', 'dist', '.git', 'site'].includes(entry)) {
          traverse(fullPath);
        }
      } else if (stat.isFile() && (entry.endsWith('.ts') || entry.endsWith('.tsx'))) {
        // Skip declaration files
        if (!entry.endsWith('.d.ts')) {
          totalFixed += fixImportsInFile(fullPath);
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

console.log(`\nFixed imports in ${totalFixed} files (${srcFixed} in src/, ${testFixed} in test/).`);
