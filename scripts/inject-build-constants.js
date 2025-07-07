#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Configuration
const CONSTANTS_TO_INJECT = {
  PROMPTFOO_POSTHOG_KEY: process.env.PROMPTFOO_POSTHOG_KEY || '',
};

// Files to process
const filesToProcess = [
  'dist/src/generated-constants.js',
  // Add more files here if needed in the future
];

console.log('Injecting build constants...');

let hasErrors = false;

filesToProcess.forEach(relativeFile => {
  const filePath = path.join(__dirname, '..', relativeFile);
  
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`✗ File not found: ${filePath}`);
      hasErrors = true;
      return;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    // Replace each constant
    Object.entries(CONSTANTS_TO_INJECT).forEach(([envVar, value]) => {
      // Handle CommonJS exports
      const commonJsPattern = new RegExp(
        `process\\.env\\.${envVar}\\s*\\|\\|\\s*['"].*?['"]`,
        'g'
      );
      content = content.replace(commonJsPattern, `'${value}'`);
      
      // Handle ES modules (in case TypeScript generates them)
      const esModulePattern = new RegExp(
        `process\\.env\\.${envVar}\\s*\\|\\|\\s*['"].*?['"]`,
        'g'
      );
      content = content.replace(esModulePattern, `'${value}'`);
    });
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✓ Injected constants into ${relativeFile}`);
    } else {
      console.log(`✓ No changes needed for ${relativeFile}`);
    }
  } catch (error) {
    console.error(`✗ Failed to process ${relativeFile}:`, error.message);
    hasErrors = true;
  }
});

if (hasErrors) {
  console.error('\n✗ Build constant injection completed with errors');
  process.exit(1);
} else {
  console.log('\n✓ Build constant injection completed successfully');
} 