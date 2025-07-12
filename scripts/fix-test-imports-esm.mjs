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

async function fixTestImports() {
  const testDir = join(process.cwd(), 'test');
  let filesFixed = 0;
  
  for await (const file of walkDir(testDir)) {
    if (!file.endsWith('.test.ts') && !file.endsWith('.test.tsx')) {
      continue;
    }
    
    console.log(`Processing ${file}...`);
    
    let content = await readFile(file, 'utf-8');
    let modified = false;
    
    // Check if file already has @jest/globals import
    const hasJestGlobals = content.includes('@jest/globals');
    
    if (!hasJestGlobals) {
      // Add jest globals import at the top
      const jestImports = [];
      
      // Check which jest globals are used
      if (content.includes('jest.')) jestImports.push('jest');
      if (content.includes('describe(')) jestImports.push('describe');
      if (content.includes('beforeEach(')) jestImports.push('beforeEach');
      if (content.includes('afterEach(')) jestImports.push('afterEach');
      if (content.includes('beforeAll(')) jestImports.push('beforeAll');
      if (content.includes('afterAll(')) jestImports.push('afterAll');
      if (content.includes('it(') || content.includes('it.each(')) jestImports.push('it');
      if (content.includes('test(')) jestImports.push('test');
      if (content.includes('expect(')) jestImports.push('expect');
      
      if (jestImports.length > 0) {
        const importStatement = `import { ${jestImports.join(', ')} } from '@jest/globals';\n`;
        content = importStatement + content;
        modified = true;
      }
    } else {
      // Update existing jest globals import to include all needed functions
      const jestGlobalsMatch = content.match(/import\s*{\s*([^}]+)\s*}\s*from\s*['"]@jest\/globals['"]/);
      if (jestGlobalsMatch) {
        const existingImports = jestGlobalsMatch[1].split(',').map(s => s.trim());
        const neededImports = new Set(existingImports);
        
        // Add missing imports
        if (content.includes('jest.') && !existingImports.includes('jest')) neededImports.add('jest');
        if (content.includes('describe(') && !existingImports.includes('describe')) neededImports.add('describe');
        if (content.includes('beforeEach(') && !existingImports.includes('beforeEach')) neededImports.add('beforeEach');
        if (content.includes('afterEach(') && !existingImports.includes('afterEach')) neededImports.add('afterEach');
        if (content.includes('beforeAll(') && !existingImports.includes('beforeAll')) neededImports.add('beforeAll');
        if (content.includes('afterAll(') && !existingImports.includes('afterAll')) neededImports.add('afterAll');
        if ((content.includes('it(') || content.includes('it.each(')) && !existingImports.includes('it')) neededImports.add('it');
        if (content.includes('test(') && !existingImports.includes('test')) neededImports.add('test');
        if (content.includes('expect(') && !existingImports.includes('expect')) neededImports.add('expect');
        
        const newImports = Array.from(neededImports).sort().join(', ');
        if (newImports !== existingImports.join(', ')) {
          content = content.replace(jestGlobalsMatch[0], `import { ${newImports} } from '@jest/globals'`);
          modified = true;
        }
      }
    }
    
    // Fix relative imports to add .js extension
    content = content.replace(
      /from\s+['"](\.[^'"]+)(?<!\.js)(?<!\.json)(?<!\.css)(?<!\.scss)['"]/g,
      (match, importPath) => {
        // Skip if it's already .js or other file extensions
        if (importPath.match(/\.(js|jsx|ts|tsx|mjs|cjs|json|css|scss|png|jpg|svg)$/)) {
          return match;
        }
        return match.replace(importPath, `${importPath}.js`);
      }
    );
    
    // Check if content was modified by import fixes
    if (content !== await readFile(file, 'utf-8')) {
      modified = true;
    }
    
    if (modified) {
      await writeFile(file, content);
      console.log(`  ✓ Fixed imports in ${file}`);
      filesFixed++;
    }
  }
  
  console.log(`\nFixed ${filesFixed} test files.`);
}

fixTestImports().catch(console.error);