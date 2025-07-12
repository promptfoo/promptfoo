#!/usr/bin/env node
const { execSync } = require('child_process');
const { performance } = require('perf_hooks');
const fs = require('fs');

/**
 * Benchmark production build CLI startup times for various commands
 */

const commands = [
  { cmd: '--help', description: 'Help command (should be fastest)' },
  { cmd: '--version', description: 'Version command' },
  { cmd: 'init --help', description: 'Init help' },
  { cmd: 'eval --help', description: 'Eval help' },
  { cmd: 'redteam --help', description: 'Redteam help' },
  { cmd: 'view --help', description: 'View help' },
  { cmd: 'share --help', description: 'Share help' },
  { cmd: 'generate --help', description: 'Generate help' },
];

function measureCommand(command) {
  const iterations = 5;
  const times = [];
  
  // Check if dist exists
  if (!fs.existsSync('./dist/src/main.js')) {
    throw new Error('Production build not found. Run "npm run build" first.');
  }
  
  // Warm up
  try {
    execSync(`node ./dist/src/main.js ${command}`, { stdio: 'ignore' });
  } catch (e) {
    // Ignore errors
  }
  
  // Measure
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    try {
      execSync(`node ./dist/src/main.js ${command}`, { stdio: 'ignore' });
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

const version = process.argv[2] || 'current';
console.log(`Benchmarking promptfoo CLI startup times (${version} version)...\n`);
console.log('Using production build from ./dist/src/main.js');
console.log('Running 5 iterations per command after 1 warmup\n');

const results = [];

for (const { cmd, description } of commands) {
  process.stdout.write(`Testing "${cmd}" - ${description}... `);
  try {
    const result = measureCommand(cmd);
    results.push({ cmd, description, ...result });
    console.log(`✓`);
  } catch (error) {
    console.log(`✗ Error: ${error.message}`);
  }
}

// Print results
console.log('\n' + '='.repeat(80));
console.log(`RESULTS - ${version.toUpperCase()} VERSION (all times in milliseconds)`);
console.log('='.repeat(80));
console.log();

// Sort by average time
results.sort((a, b) => a.avg - b.avg);

// Print summary table
console.log('| Command | Description | Average | Min | Max |');
console.log('|---------|-------------|---------|-----|-----|');
for (const result of results) {
  console.log(`| ${result.cmd.padEnd(15)} | ${result.description.padEnd(25)} | ${result.avg.toFixed(0).padStart(7)}ms | ${result.min.toFixed(0).padStart(4)}ms | ${result.max.toFixed(0).padStart(4)}ms |`);
}

// Print detailed results
console.log('\nDetailed Results:');
console.log('-'.repeat(80));
for (const result of results) {
  console.log(`\nCommand: ${result.cmd}`);
  console.log(`All runs: ${result.times.map(t => t.toFixed(0) + 'ms').join(', ')}`);
}

// Save results to JSON for comparison
const resultsFile = `scripts/benchmark-results-${version}.json`;
fs.writeFileSync(resultsFile, JSON.stringify({
  version,
  date: new Date().toISOString(),
  results: results.map(r => ({
    cmd: r.cmd,
    description: r.description,
    avg: r.avg,
    min: r.min,
    max: r.max
  }))
}, null, 2));

console.log(`\nResults saved to ${resultsFile}`);

// Print summary
console.log('\n' + '='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));
console.log();

const helpTime = results.find(r => r.cmd === '--help')?.avg || 0;
const slowest = results[results.length - 1];

console.log(`Fastest: ${results[0].cmd} (${results[0].avg.toFixed(0)}ms)`);
console.log(`Slowest: ${slowest.cmd} (${slowest.avg.toFixed(0)}ms)`);
if (helpTime > 0) {
  console.log(`Slowdown factor: ${(slowest.avg / helpTime).toFixed(1)}x`);
} 