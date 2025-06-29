#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Fix ESM imports by adding .js extensions to relative imports
 * This is needed because TypeScript doesn't automatically add extensions in ESM mode
 */
function fixEsmImports(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      fixEsmImports(filePath);
    } else if (file.endsWith('.js')) {
      let content = fs.readFileSync(filePath, 'utf8');
      let modified = false;
      
      // Fix import statements with relative paths that don't have extensions
      let newContent = content.replace(
        /((?:import|export)[\s\S]*?from\s+['"`])(\.{1,2}[^'"`]*?)(['"`])/g,
        (match, prefix, importPath, suffix) => {
          // Skip if:
          // - already has a proper file extension (.js, .json, .mjs, .cjs, .ts, .tsx, .jsx)
          // - is a package import (doesn't start with . or /)
          if (importPath.match(/\.(js|json|mjs|cjs|ts|tsx|jsx)$/) || (!importPath.startsWith('./') && !importPath.startsWith('../') && importPath !== '.')) {
            return match;
          }
          
          // Check if this is a directory import that should become index.js
          const targetDir = path.resolve(path.dirname(filePath), importPath);
          const indexPath = path.join(targetDir, 'index.js');
          
          if (fs.existsSync(indexPath)) {
            // It's a directory with an index.js file
            modified = true;
            return `${prefix}${importPath}/index.js${suffix}`;
          } else {
            // It's a regular file import
            modified = true;
            return `${prefix}${importPath}.js${suffix}`;
          }
        }
      );
      
      // Fix JSON imports to add the required import attribute for ESM
      newContent = newContent.replace(
        /(import\s+[\s\S]*?from\s+['"`][^'"`]*\.json['"`])(?!\s+with\s)/g,
        (match, importPart) => {
          // Skip if already has import attribute
          if (importPart.includes('with') || importPart.includes('assert')) {
            return match;
          }
          modified = true;
          return importPart + ' with { type: "json" }';
        }
      );
      
      // Fix specific package subpath imports that need .js extensions in ESM
      const packageSubpathFixes = [
        // semver package subpaths
        { from: "semver/functions/gt", to: "semver/functions/gt.js" },
        { from: "semver/functions/gte", to: "semver/functions/gte.js" },
        { from: "semver/functions/lt", to: "semver/functions/lt.js" },
        { from: "semver/functions/lte", to: "semver/functions/lte.js" },
        { from: "semver/functions/eq", to: "semver/functions/eq.js" },
        { from: "semver/functions/valid", to: "semver/functions/valid.js" },
      ];
      
      for (const { from, to } of packageSubpathFixes) {
        const regex = new RegExp(`((?:import|export)[\\s\\S]*?from\\s+['\"\`])${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(['\"\`])`, 'g');
        if (newContent.includes(`'${from}'`) || newContent.includes(`"${from}"`) || newContent.includes(`\`${from}\``)) {
          newContent = newContent.replace(regex, `$1${to}$2`);
          modified = true;
        }
      }
      
      // Fix CommonJS patterns that don't work in ESM
      const commonjsPatterns = [
        {
          pattern: /if\s*\(\s*require\.main\s*===\s*module\s*\)/g,
          replacement: 'if (import.meta.url === `file://${process.argv[1]}`)'
        },
        {
          pattern: /__dirname/g,
          replacement: 'path.dirname(new URL(import.meta.url).pathname)'
        },
        {
          pattern: /__filename/g,
          replacement: 'new URL(import.meta.url).pathname'
        }
      ];
      
      for (const { pattern, replacement } of commonjsPatterns) {
        if (newContent.match(pattern)) {
          newContent = newContent.replace(pattern, replacement);
          modified = true;
        }
      }
      
      if (modified) {
        fs.writeFileSync(filePath, newContent);
        console.log(`Fixed imports in: ${filePath}`);
      }
    }
  }
}

const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  console.log('Fixing ESM imports in dist directory...');
  fixEsmImports(distDir);
  console.log('Fixed ESM imports successfully');
} else {
  console.error('dist directory not found');
  process.exit(1);
}