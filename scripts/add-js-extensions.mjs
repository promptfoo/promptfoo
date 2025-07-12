#!/usr/bin/env node
import { readdir, readFile, writeFile, stat } from 'fs/promises';
import { join, resolve, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const distEsmDir = resolve(__dirname, '..', 'dist', 'esm');

async function* walk(dir) {
  const dirents = await readdir(dir, { withFileTypes: true });
  for (const dirent of dirents) {
    const res = resolve(dir, dirent.name);
    if (dirent.isDirectory()) {
      yield* walk(res);
    } else {
      yield res;
    }
  }
}

async function processFile(filePath) {
  if (!filePath.endsWith('.js')) return;
  
  let content = await readFile(filePath, 'utf-8');
  let modified = false;
  
  // Helper to check if a path likely refers to a directory
  async function isDirectory(importPath, currentFileDir) {
    const absolutePath = resolve(currentFileDir, importPath);
    
    // First check if it's a file with .js extension
    try {
      const stats = await stat(absolutePath + '.js');
      if (stats.isFile()) {
        return false; // It's a file, not a directory
      }
    } catch {
      // File doesn't exist, continue checking
    }
    
    try {
      const stats = await stat(absolutePath);
      return stats.isDirectory();
    } catch {
      // If the path doesn't exist, check if adding /index.js would work
      try {
        await stat(absolutePath + '/index.js');
        return true;
      } catch {
        return false;
      }
    }
  }
  
  const currentFileDir = dirname(filePath);
  
  // Process all imports/exports
  const importRegexes = [
    // Relative imports (including bare '.')
    /(\bimport\s+(?:[^'"]*\s+from\s+)?['"])(\.(?:[^'"]*))(['"])/g,
    /(\bexport\s+(?:[^'"]*\s+from\s+)?['"])(\.(?:[^'"]*))(['"])/g,
    /(\bimport\s*\(\s*['"])(\.(?:[^'"]*))(['"]\s*\))/g,
    // Package imports with subpaths (e.g., 'semver/functions/gt')
    /(\bimport\s+(?:[^'"]*\s+from\s+)?['"])([^'"./]+\/[^'"]+)(['"])/g,
    /(\bexport\s+(?:[^'"]*\s+from\s+)?['"])([^'"./]+\/[^'"]+)(['"])/g,
    /(\bimport\s*\(\s*['"])([^'"./]+\/[^'"]+)(['"]\s*\))/g
  ];
  
  for (const regex of importRegexes) {
    const matches = [...content.matchAll(regex)];
    
    for (const match of matches) {
      const [fullMatch, prefix, importPath, suffix] = match;
      
      if (!importPath.endsWith('.js') && !importPath.endsWith('.json') && !importPath.endsWith('.html')) {
        let newPath = importPath;
        
        // Check if this is a relative import or a package subpath import
        if (importPath.startsWith('.')) {
          // Handle bare '.' import
          if (importPath === '.') {
            newPath = './index.js';
          } else if (await isDirectory(importPath, currentFileDir)) {
            newPath = importPath + '/index.js';
          } else {
            newPath = importPath + '.js';
          }
        } else {
          // Package subpath import - check if it's a known pattern that shouldn't have .js
          const packageName = importPath.split('/')[0];
          const subpath = importPath.substring(packageName.length + 1);
          
          // Skip adding .js to package names without subpaths or @scoped packages without subpaths
          if (!subpath || (packageName.startsWith('@') && importPath.split('/').length === 2)) {
            continue; // Skip this import
          }
          
          // For package subpaths, be very conservative about adding .js
          // Most packages with exports maps don't support .js extensions
          continue; // Skip package imports entirely
        }
        
        const newMatch = prefix + newPath + suffix;
        content = content.replace(fullMatch, newMatch);
        modified = true;
      }
    }
  }
  
  if (modified) {
    await writeFile(filePath, content, 'utf-8');
    console.log(`Updated imports in ${relative(distEsmDir, filePath)}`);
  }
}

async function main() {
  console.log('Adding .js extensions to ESM imports...');
  
  for await (const filePath of walk(distEsmDir)) {
    await processFile(filePath);
  }
  
  console.log('Done adding .js extensions');
}

main().catch(console.error);