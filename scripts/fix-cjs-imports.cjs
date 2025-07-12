#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const distCjsDir = path.resolve(__dirname, '..', 'dist', 'cjs');

// Recursively get all JS files
function* walkSync(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    if (file.isDirectory()) {
      yield* walkSync(path.join(dir, file.name));
    } else if (file.name.endsWith('.js')) {
      yield path.join(dir, file.name);
    }
  }
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;
  
  // Replace import.meta references
  if (content.includes('import.meta')) {
    // Replace typeof import.meta !== 'undefined' with false in CJS
    content = content.replace(/typeof import\.meta !== 'undefined'/g, 'false');
    
    // Replace typeof import.meta === 'undefined' with true in CJS
    content = content.replace(/typeof import\.meta === 'undefined'/g, 'true');
    
    // Replace import.meta.url with undefined
    content = content.replace(/import\.meta\.url/g, 'undefined');
    
    // Replace any remaining import.meta with undefined
    content = content.replace(/import\.meta/g, 'undefined');
    
    modified = true;
  }
  
  // Fix esm.js to restore CommonJS fallback for CJS build
  if (filePath.endsWith('esm.js')) {
    // Find the error throwing section and restore the require fallback
    const esmOnlyError = /\/\/ In ESM build[\s\S]*?throw err;\s*}/;
    if (esmOnlyError.test(content)) {
      const cjsFallback = `// If ESM import fails, try CommonJS require as fallback
    logger.debug(\`ESM import failed: \${err}\`);
    logger.debug('Attempting CommonJS require fallback...');
    try {
      // In CJS build, require is available
      const importedModule = require(safeResolve(modulePath));
      const mod = importedModule?.default?.default || importedModule?.default || importedModule;
      logger.debug(
        \`Successfully required module: \${JSON.stringify({ resolvedPath: safeResolve(modulePath), moduleId: modulePath })}\`,
      );
      if (functionName) {
        logger.debug(\`Returning named export: \${functionName}\`);
        return mod[functionName];
      }
      return mod;
    } catch (requireErr) {
      logger.debug(\`CommonJS require also failed: \${requireErr}\`);
      throw requireErr;
    }
  }`;
      
      content = content.replace(esmOnlyError, cjsFallback);
      modified = true;
    }
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Fixed CJS imports in ${path.relative(distCjsDir, filePath)}`);
  }
}

console.log('Fixing CJS build imports...');

for (const filePath of walkSync(distCjsDir)) {
  processFile(filePath);
}

console.log('Done fixing CJS imports');