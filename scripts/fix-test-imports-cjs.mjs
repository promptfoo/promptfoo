#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

async function* walkDir(dir) {
  const dirents = await readdir(dir, { withFileTypes: true });
  
  for (const dirent of dirents) {
    const res = join(dir, dirent.name);
    if (dirent.isDirectory()) {
      yield* walkDir(res);
    } else {
      yield res;
    }
  }
}

async function fixTestImportsForCJS() {
  const testDir = join(process.cwd(), 'test');
  let filesFixed = 0;
  
  for await (const file of walkDir(testDir)) {
    if (!file.endsWith('.test.ts') && !file.endsWith('.test.tsx')) {
      continue;
    }
    
    console.log(`Processing ${file}...`);
    
    let content = await readFile(file, 'utf-8');
    let modified = false;
    
    // Remove .js extensions from relative imports
    const newContent = content.replace(
      /from\s+['"](\.[^'"]+)\.js['"]/g,
      (match, importPath) => {
        modified = true;
        return `from '${importPath}'`;
      }
    );
    
    if (modified) {
      await writeFile(file, newContent);
      console.log(`  ✓ Fixed imports in ${file}`);
      filesFixed++;
    }
  }
  
  console.log(`\nFixed ${filesFixed} test files for CJS compatibility.`);
}

fixTestImportsForCJS().catch(console.error);