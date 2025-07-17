#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Script to verify package integrity and prevent dependency misconfiguration issues
 * 
 * This script checks:
 * 1. All runtime imports are in dependencies (not devDependencies)
 *    - Excludes known build-time packages
 *    - Excludes optional peer dependencies listed in optional-peer-dependencies.json
 * 2. Package can be installed via npx
 * 3. Critical runtime dependencies are present
 * 
 * Optional peer dependencies are packages that users install separately based on
 * which providers they use (e.g., @aws-sdk/* for AWS providers, @azure/* for Azure, etc.)
 */

const COLORS = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function loadOptionalPeerDependencies() {
  try {
    const configPath = path.join(__dirname, 'optional-peer-dependencies.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return {
      packages: new Set(config.packages || []),
      patterns: config.patterns || []
    };
  } catch (error) {
    log('Warning: Could not load optional-peer-dependencies.json', 'yellow');
    return { packages: new Set(), patterns: [] };
  }
}

function getPackageJson() {
  const packagePath = path.join(__dirname, '..', 'package.json');
  return JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
}

function findImportsInSource() {
  const srcDir = path.join(__dirname, '..', 'src');
  const imports = new Set();
  
  function scanDirectory(dir) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory() && !file.includes('test') && file !== '__tests__') {
        scanDirectory(filePath);
      } else if (file.endsWith('.ts') && !file.endsWith('.test.ts')) {
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Match various import patterns
        const importRegexes = [
          /import\s+.*\s+from\s+['"]([^'"]+)['"]/g,
          /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
          /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
        ];
        
        for (const regex of importRegexes) {
          let match;
          while ((match = regex.exec(content)) !== null) {
            const importPath = match[1];
            // Only track external packages (not relative imports)
            if (!importPath.startsWith('.') && !importPath.startsWith('@/')) {
              // Extract package name (handle scoped packages)
              const packageName = importPath.startsWith('@') 
                ? importPath.split('/').slice(0, 2).join('/')
                : importPath.split('/')[0];
              imports.add(packageName);
            }
          }
        }
      }
    }
  }
  
  scanDirectory(srcDir);
  return imports;
}

function checkDependencyPlacement() {
  const pkg = getPackageJson();
  const dependencies = new Set(Object.keys(pkg.dependencies || {}));
  const devDependencies = new Set(Object.keys(pkg.devDependencies || {}));
  const imports = findImportsInSource();
  const optionalPeerDeps = loadOptionalPeerDependencies();
  
  const issues = [];
  
  // Check for runtime imports in devDependencies
  for (const imp of imports) {
    if (devDependencies.has(imp) && !dependencies.has(imp)) {
      // Skip known build-time only packages
      const buildTimeOnly = [
        '@types/', 
        'typescript',
        'eslint',
        'prettier',
        'jest',
        'vitest',
        '@swc/',
        'ts-node',
        'nodemon',
      ];
      
      // Check if it's a build-time package
      const isBuildTime = buildTimeOnly.some(pattern => imp.includes(pattern));
      
      // Check if it's an optional peer dependency
      const isOptionalPeer = optionalPeerDeps.packages.has(imp) || 
                           optionalPeerDeps.patterns.some(pattern => imp.startsWith(pattern));
      
      if (!isBuildTime && !isOptionalPeer) {
        issues.push({
          type: 'misplaced',
          package: imp,
          message: `Package "${imp}" is imported in source code but listed in devDependencies`,
        });
      }
    }
  }
  
  return issues;
}

function checkCriticalDependencies() {
  const pkg = getPackageJson();
  const dependencies = new Set(Object.keys(pkg.dependencies || {}));
  
  // Critical packages that must be in dependencies for promptfoo to work
  const criticalPackages = [
    '@inquirer/checkbox',
    '@inquirer/confirm', 
    '@inquirer/editor',
    '@inquirer/input',
    '@inquirer/select',
    'chalk',
    'commander',
    'js-yaml',
    'dotenv',
  ];
  
  const missing = criticalPackages.filter(pkg => !dependencies.has(pkg));
  
  return missing.map(pkg => ({
    type: 'missing',
    package: pkg,
    message: `Critical package "${pkg}" is missing from dependencies`,
  }));
}

function testNpxInstallation() {
  log('\nTesting npx installation simulation...', 'blue');
  
  try {
    // Create a temporary directory
    const tempDir = path.join(__dirname, '..', 'temp-npx-test');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    fs.mkdirSync(tempDir);
    
    // Pack the current package
    log('Packing current package...', 'yellow');
    execSync('npm pack', { cwd: path.join(__dirname, '..') });
    
    // Find the packed file
    const files = fs.readdirSync(path.join(__dirname, '..'));
    const packedFile = files.find(f => f.startsWith('promptfoo-') && f.endsWith('.tgz'));
    
    if (!packedFile) {
      throw new Error('Could not find packed .tgz file');
    }
    
    // Test installation
    log('Testing installation from tarball...', 'yellow');
    execSync(`npm init -y`, { cwd: tempDir, stdio: 'ignore' });
    execSync(`npm install ${path.join(__dirname, '..', packedFile)} --production`, { 
      cwd: tempDir,
      stdio: 'ignore' 
    });
    
    // Test if promptfoo command works
    log('Testing promptfoo command...', 'yellow');
    execSync(`npx promptfoo --version`, { cwd: tempDir, stdio: 'ignore' });
    
    // Cleanup
    fs.rmSync(tempDir, { recursive: true });
    fs.unlinkSync(path.join(__dirname, '..', packedFile));
    
    log('✓ npx installation test passed', 'green');
    return [];
  } catch (error) {
    log(`✗ npx installation test failed: ${error.message}`, 'red');
    return [{
      type: 'npx-test',
      message: `npx installation test failed: ${error.message}`,
    }];
  }
}

function main() {
  log('🔍 Verifying package integrity...\n', 'blue');
  
  const issues = [];
  
  // Check dependency placement
  log('Checking dependency placement...', 'blue');
  const placementIssues = checkDependencyPlacement();
  issues.push(...placementIssues);
  
  // Check critical dependencies
  log('Checking critical dependencies...', 'blue');
  const missingDeps = checkCriticalDependencies();
  issues.push(...missingDeps);
  
  // Test npx installation
  const npxIssues = testNpxInstallation();
  issues.push(...npxIssues);
  
  // Report results
  console.log('\n' + '='.repeat(60));
  
  if (issues.length === 0) {
    log('✅ All checks passed!', 'green');
    log('\nPackage integrity verified. Safe to release.', 'green');
  } else {
    log(`❌ Found ${issues.length} issue(s):`, 'red');
    console.log();
    
    issues.forEach((issue, i) => {
      log(`${i + 1}. ${issue.message}`, 'red');
    });
    
    console.log('\n' + '='.repeat(60));
    log('\nPlease fix these issues before releasing.', 'yellow');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { checkDependencyPlacement, checkCriticalDependencies }; 