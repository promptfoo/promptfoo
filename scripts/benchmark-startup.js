#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

// Benchmark function
function benchmark(name, fn, iterations = 10) {
  const times = [];
  
  console.log(`Running ${name}... (${iterations} iterations)`);
  
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    try {
      fn();
    } catch (e) {
      // Ignore errors from commands that exit with non-zero
    }
    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1000000); // Convert to milliseconds
    process.stdout.write('.');
  }
  console.log('');
  
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const median = times[Math.floor(times.length / 2)];
  const min = times[0];
  const max = times[times.length - 1];
  
  console.log(`  Average: ${avg.toFixed(2)}ms`);
  console.log(`  Median:  ${median.toFixed(2)}ms`);
  console.log(`  Min:     ${min.toFixed(2)}ms`);
  console.log(`  Max:     ${max.toFixed(2)}ms`);
  
  return { name, avg, median, min, max };
}

// Build the project first
console.log('Building project...');
try {
  execSync('npm run build', { cwd: path.join(__dirname, '..'), stdio: 'pipe' });
} catch (e) {
  console.error('Build failed. Please ensure the project builds successfully first.');
  process.exit(1);
}

console.log('\nBenchmarking CLI startup times...\n');

const results = [];

// Benchmark various commands
results.push(benchmark('promptfoo --help', () => {
  execSync('node dist/src/main.js --help', { 
    cwd: path.join(__dirname, '..'), 
    stdio: 'pipe' 
  });
}));

results.push(benchmark('promptfoo --version', () => {
  execSync('node dist/src/main.js --version', { 
    cwd: path.join(__dirname, '..'), 
    stdio: 'pipe' 
  });
}));

results.push(benchmark('promptfoo list --help', () => {
  execSync('node dist/src/main.js list --help', { 
    cwd: path.join(__dirname, '..'), 
    stdio: 'pipe' 
  });
}, 5));

results.push(benchmark('promptfoo eval --help', () => {
  execSync('node dist/src/main.js eval --help', { 
    cwd: path.join(__dirname, '..'), 
    stdio: 'pipe' 
  });
}, 5));

// Summary
console.log('\n=== STARTUP TIME SUMMARY ===');
console.log('Command'.padEnd(30) + 'Average (ms)'.padEnd(15) + 'Median (ms)');
console.log('-'.repeat(55));

results.forEach(result => {
  console.log(
    result.name.padEnd(30) + 
    result.avg.toFixed(0).padEnd(15) + 
    result.median.toFixed(0)
  );
});

console.log('\n=== ANALYSIS ===');
const helpTime = results.find(r => r.name === 'promptfoo --help').avg;
console.log(`Base CLI startup time (--help): ~${helpTime.toFixed(0)}ms`);

if (helpTime > 400) {
  console.log('\n⚠️  CLI startup is slower than expected (>400ms)');
  console.log('The lazy loading optimizations should help reduce this significantly.');
} else {
  console.log('\n✅ CLI startup time is reasonable');
}

console.log('\nTo track improvement:');
console.log('1. Save these baseline numbers');
console.log('2. Implement lazy loading changes');
console.log('3. Run this script again to compare');