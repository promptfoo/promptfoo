#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// List of commands to benchmark
const commands = [
  { name: '--version', cmd: 'node dist/src/main.js --version' },
  { name: '--help', cmd: 'node dist/src/main.js --help' },
  { name: 'eval --help', cmd: 'node dist/src/main.js eval --help' },
  { name: 'init --help', cmd: 'node dist/src/main.js init --help' },
  { name: 'view --help', cmd: 'node dist/src/main.js view --help' },
  { name: 'share --help', cmd: 'node dist/src/main.js share --help' },
  { name: 'cache --help', cmd: 'node dist/src/main.js cache --help' },
  { name: 'config --help', cmd: 'node dist/src/main.js config --help' },
  { name: 'list --help', cmd: 'node dist/src/main.js list --help' },
  { name: 'show --help', cmd: 'node dist/src/main.js show --help' },
  { name: 'delete --help', cmd: 'node dist/src/main.js delete --help' },
  { name: 'import --help', cmd: 'node dist/src/main.js import --help' },
  { name: 'export --help', cmd: 'node dist/src/main.js export --help' },
  { name: 'generate --help', cmd: 'node dist/src/main.js generate --help' },
  { name: 'redteam --help', cmd: 'node dist/src/main.js redteam --help' },
  { name: 'eval (no args)', cmd: 'node dist/src/main.js eval 2>&1 || true' },
  { name: 'list evals', cmd: 'node dist/src/main.js list evals' },
];

// Number of runs per command for averaging
const RUNS_PER_COMMAND = 5;
const WARMUP_RUNS = 1;

function measureCommand(command) {
  const times = [];
  
  // Warmup runs
  for (let i = 0; i < WARMUP_RUNS; i++) {
    try {
      execSync(command, { encoding: 'utf8', stdio: 'ignore' });
    } catch (e) {
      // Ignore errors for now
    }
  }
  
  // Actual measurement runs
  for (let i = 0; i < RUNS_PER_COMMAND; i++) {
    const start = process.hrtime.bigint();
    try {
      execSync(command, { encoding: 'utf8', stdio: 'ignore' });
    } catch (e) {
      // Some commands might exit with non-zero, but we still want timing
    }
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;
    times.push(durationMs);
  }
  
  // Calculate statistics
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  
  return { avg, min, max, times };
}

console.log('Promptfoo Startup Performance Benchmark');
console.log('=======================================\n');
console.log(`Running ${RUNS_PER_COMMAND} iterations per command (after ${WARMUP_RUNS} warmup runs)\n`);

// Check if built
try {
  if (!fs.existsSync('dist/src/main.js')) {
    console.log('Building project first...');
    execSync('npm run build', { stdio: 'inherit' });
  }
} catch (e) {
  console.error('Failed to build project:', e.message);
  process.exit(1);
}

const results = [];

// Run benchmarks
for (const { name, cmd } of commands) {
  process.stdout.write(`Benchmarking "${name}"... `);
  const result = measureCommand(cmd);
  results.push({ name, cmd, ...result });
  console.log(`avg: ${result.avg.toFixed(2)}ms (min: ${result.min.toFixed(2)}ms, max: ${result.max.toFixed(2)}ms)`);
}

// Generate markdown table
console.log('\n\nMarkdown Table for TODO.md:');
console.log('| Command | Average (ms) | Min (ms) | Max (ms) |');
console.log('|---------|-------------|----------|----------|');
results.forEach(({ name, avg, min, max }) => {
  console.log(`| ${name} | ${avg.toFixed(2)} | ${min.toFixed(2)} | ${max.toFixed(2)} |`);
});

// Save raw results
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const resultsPath = path.join(__dirname, `benchmark-results-${timestamp}.json`);
fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
console.log(`\nRaw results saved to: ${resultsPath}`); 