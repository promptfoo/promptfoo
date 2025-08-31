#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function copyAndPrepareForCjs(srcDir, destDir, isTestDir = false) {
  // Ensure destination directory exists
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const items = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const item of items) {
    const srcPath = path.join(srcDir, item.name);
    const destPath = path.join(destDir, item.name);

    // Skip app directory (React frontend) and workers for CJS build
    if (item.name === 'app' || item.name === 'workers') {
      continue;
    }

    if (item.isDirectory()) {
      copyAndPrepareForCjs(srcPath, destPath, isTestDir);
    } else if (item.name.endsWith('.ts') || item.name.endsWith('.js')) {
      let content = fs.readFileSync(srcPath, 'utf8');

      // Remove JSON import assertions for CJS compatibility
      content = content.replace(
        /(\s+)with\s+\{\s*type:\s*["']json["']\s*\}/g,
        ''
      );

      // For test files, update imports from ../src/ to ../.cjs-src/
      if (isTestDir) {
        content = content.replace(/from\s+['"]\.\.\/src\//g, "from '../.cjs-src/");
        content = content.replace(/from\s+['"]\.\.\/\.\.\/src\//g, "from '../../.cjs-src/");
        content = content.replace(/from\s+['"]\.\.\/\.\.\/\.\.\/src\//g, "from '../../../.cjs-src/");
      }

      fs.writeFileSync(destPath, content);
    } else {
      // Copy other files as-is
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (require.main === module) {
  const srcDir = path.join(__dirname, '..', 'src');
  const testDir = path.join(__dirname, '..', 'test');
  const cjsSrcDir = path.join(__dirname, '..', '.cjs-src');
  const cjsTestDir = path.join(__dirname, '..', '.cjs-test');
  
  console.log('Preparing CJS source by removing JSON import assertions...');
  
  // Clean existing directories
  if (fs.existsSync(cjsSrcDir)) {
    fs.rmSync(cjsSrcDir, { recursive: true, force: true });
  }
  if (fs.existsSync(cjsTestDir)) {
    fs.rmSync(cjsTestDir, { recursive: true, force: true });
  }
  
  copyAndPrepareForCjs(srcDir, cjsSrcDir, false);
  copyAndPrepareForCjs(testDir, cjsTestDir, true);
  console.log('CJS source and tests prepared!');
}