#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function renameJsFiles(dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);

    if (item.isDirectory()) {
      renameJsFiles(fullPath);
    } else if (item.name.endsWith('.js')) {
      const newPath = fullPath.replace(/\.js$/, '.cjs');
      console.log(`Renaming: ${fullPath} → ${newPath}`);
      fs.renameSync(fullPath, newPath);
    }
  }
}

if (require.main === module) {
  const cjsDir = path.join(__dirname, '..', 'dist', 'cjs');

  if (!fs.existsSync(cjsDir)) {
    console.error('CJS dist directory not found:', cjsDir);
    process.exit(1);
  }

  console.log('Renaming .js files to .cjs in', cjsDir);
  renameJsFiles(cjsDir);
  console.log('JS to CJS renaming complete!');
}
