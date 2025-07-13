#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';

// Fix JSON imports to use 'with' instead of 'assert'
function fixJsonImportsInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Replace assert with with for JSON imports
  const newContent = content.replace(
    /(import\s+(?:[\w\s{},*]+\s+)?(?:from\s+)?['"][^'"]+['"]\s+)assert(\s*{\s*type:\s*['"]json['"]\s*})/g,
    (match, prefix, suffix) => {
      modified = true;
      return `${prefix}with${suffix}`;
    },
  );

  if (modified) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`Fixed JSON imports in: ${filePath}`);
  }
}

// Fix all JS files in dist
const jsFiles = glob.sync('dist/**/*.js');
for (const file of jsFiles) {
  fixJsonImportsInFile(file);
}

console.log('JSON import fixing complete!');
