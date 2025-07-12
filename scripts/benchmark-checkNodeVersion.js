#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Create test files
const testDir = path.join(__dirname, '../test-checkNodeVersion');
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir);
}

// Test 1: Original version with logger import
const original = `
#!/usr/bin/env node
const { checkNodeVersion } = require('../dist/src/checkNodeVersion');
checkNodeVersion();
console.log('OK');
`;

// Test 2: Lazy-loaded version
const lazy = `
#!/usr/bin/env node
const { checkNodeVersion } = require('../dist/src/checkNodeVersion-optimized');
checkNodeVersion().then(() => console.log('OK'));
`;

// Test 3: Simplest version
const simplest = `
#!/usr/bin/env node
const { checkNodeVersion } = require('../dist/src/checkNodeVersion-simplest');
checkNodeVersion();
console.log('OK');
`;

// Write test files
fs.writeFileSync(path.join(testDir, 'test-original.js'), original);
fs.writeFileSync(path.join(testDir, 'test-lazy.js'), lazy);
fs.writeFileSync(path.join(testDir, 'test-simplest.js'), simplest);

console.log('Benchmarking checkNodeVersion implementations...\n');

function benchmark(name, file) {
  const times = [];
  const runs = 10;
  
  // Warm up
  execSync(`node ${file}`, { stdio: 'ignore' });
  
  for (let i = 0; i < runs; i++) {
    const start = Date.now();
    execSync(`node ${file}`, { stdio: 'ignore' });
    const end = Date.now();
    times.push(end - start);
  }
  
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  
  console.log(`${name}:`);
  console.log(`  Average: ${avg.toFixed(1)}ms`);
  console.log(`  Min: ${min}ms, Max: ${max}ms`);
  console.log(`  Times: ${times.join(', ')}`);
  console.log();
  
  return avg;
}

// Run benchmarks
const originalTime = benchmark('Original (with logger)', path.join(testDir, 'test-original.js'));
const lazyTime = benchmark('Lazy-loaded logger', path.join(testDir, 'test-lazy.js'));
const simplestTime = benchmark('Simplest (no logger)', path.join(testDir, 'test-simplest.js'));

// Summary
console.log('Summary:');
console.log(`  Original: ${originalTime.toFixed(1)}ms (baseline)`);
console.log(`  Lazy-loaded: ${lazyTime.toFixed(1)}ms (${((originalTime - lazyTime) / originalTime * 100).toFixed(1)}% faster)`);
console.log(`  Simplest: ${simplestTime.toFixed(1)}ms (${((originalTime - simplestTime) / originalTime * 100).toFixed(1)}% faster)`);

// Cleanup
fs.rmSync(testDir, { recursive: true }); 