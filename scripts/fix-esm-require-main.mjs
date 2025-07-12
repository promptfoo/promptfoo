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

async function fixRequireMain() {
  const esmDir = join(process.cwd(), 'dist/esm');
  let filesFixed = 0;
  
  for await (const file of walkDir(esmDir)) {
    if (!file.endsWith('.js')) {
      continue;
    }
    
    let content = await readFile(file, 'utf-8');
    let modified = false;
    
    // Replace require.main === module with import.meta.url condition
    if (content.includes('if (require.main === module)')) {
      content = content.replace(
        /if\s*\(\s*require\.main\s*===\s*module\s*\)/g,
        'if (import.meta.url === `file://${process.argv[1]}`)'
      );
      modified = true;
    }
    
    if (modified) {
      await writeFile(file, content);
      console.log(`Fixed require.main in ${file}`);
      filesFixed++;
    }
  }
  
  console.log(`\nFixed ${filesFixed} files.`);
}

fixRequireMain().catch(console.error);