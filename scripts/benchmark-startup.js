#!/usr/bin/env node
const { execSync } = require('child_process');
const { performance } = require('perf_hooks');

/**
 * Benchmark CLI startup times for various commands
 */

const commands = [
  { cmd: '--help', description: 'Help command (should be fastest)' },
  { cmd: '--version', description: 'Version command' },
  { cmd: 'init --help', description: 'Init help' },
  { cmd: 'eval --help', description: 'Eval help' },
  { cmd: 'redteam --help', description: 'Redteam help' },
];

function measureCommand(command) {
  const iterations = 5;
  const times = [];
  
  // Warm up
  try {
    execSync(`node src/main.ts ${command}`, { stdio: 'ignore' });
  } catch (e) {
    // Ignore errors
  }
  
  // Measure
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    try {
      execSync(`node src/main.ts ${command}`, { stdio: 'ignore' });
    } catch (e) {
      // Ignore errors, we're just measuring time
    }
    const end = performance.now();
    times.push(end - start);
  }
  
  // Calculate stats
  const avg = times.reduce((a, b) => a + b) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  
  return { avg, min, max, times };
}

console.log('Benchmarking promptfoo CLI startup times...\n');
console.log('Running 5 iterations per command after 1 warmup\n');

const results = [];

for (const { cmd, description } of commands) {
  process.stdout.write(`Testing "${cmd}" - ${description}... `);
  const result = measureCommand(cmd);
  results.push({ cmd, description, ...result });
  console.log(`✓`);
}

// Print results
console.log('\n' + '='.repeat(80));
console.log('RESULTS (all times in milliseconds)');
console.log('='.repeat(80));
console.log();

// Sort by average time
results.sort((a, b) => a.avg - b.avg);

// Print detailed results
for (const result of results) {
  console.log(`Command: ${result.cmd}`);
  console.log(`Description: ${result.description}`);
  console.log(`Average: ${result.avg.toFixed(0)}ms`);
  console.log(`Min: ${result.min.toFixed(0)}ms, Max: ${result.max.toFixed(0)}ms`);
  console.log(`All runs: ${result.times.map(t => t.toFixed(0) + 'ms').join(', ')}`);
  console.log();
}

// Print summary
console.log('='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));
console.log();

const helpTime = results.find(r => r.cmd === '--help').avg;
const slowest = results[results.length - 1];

console.log(`Fastest: ${results[0].cmd} (${results[0].avg.toFixed(0)}ms)`);
console.log(`Slowest: ${slowest.cmd} (${slowest.avg.toFixed(0)}ms)`);
console.log(`Slowdown factor: ${(slowest.avg / helpTime).toFixed(1)}x`);

// Check if compiled version exists
try {
  const compiledStart = performance.now();
  execSync(`./dist/src/main.js --help`, { stdio: 'ignore' });
  const compiledEnd = performance.now();
  const compiledTime = compiledEnd - compiledStart;
  
  console.log(`\nCompiled version (if available): ${compiledTime.toFixed(0)}ms`);
  console.log(`TypeScript overhead: ${(helpTime - compiledTime).toFixed(0)}ms`);
} catch (e) {
  console.log('\nCompiled version not found. Run "npm run build" to test compiled performance.');
} 