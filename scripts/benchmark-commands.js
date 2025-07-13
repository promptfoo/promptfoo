#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Commands to benchmark
const commands = [
  'eval --help',
  'init --help',
  'view --help',
  'cache --help',
  'share --help',
  'show --help',
  'list --help',
  'config --help',
  'auth --help',
  'delete --help',
  'export --help',
  'import --help',
  'validate --help',
  'debug --help',
  'scan-model --help',
  'generate dataset --help',
  'generate assertions --help',
];

// Number of runs per command
const RUNS_PER_COMMAND = 5;

function measureCommand(command) {
  const times = [];
  
  console.log(`Benchmarking: promptfoo ${command}`);
  
  for (let i = 0; i < RUNS_PER_COMMAND; i++) {
    try {
      const start = process.hrtime.bigint();
      execSync(`node ${path.join(__dirname, '..', 'dist', 'src', 'main.js')} ${command}`, {
        stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'production' }
      });
      const end = process.hrtime.bigint();
      const timeMs = Number(end - start) / 1_000_000;
      times.push(timeMs);
      console.log(`  Run ${i + 1}: ${timeMs.toFixed(2)}ms`);
    } catch (error) {
      console.error(`  Error running command: ${error.message}`);
    }
  }
  
  if (times.length === 0) {
    return { command, avg: null, min: null, max: null, runs: 0 };
  }
  
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  
  console.log(`  Average: ${avg.toFixed(2)}ms (min: ${min.toFixed(2)}ms, max: ${max.toFixed(2)}ms)\n`);
  
  return { command, avg, min, max, runs: times.length, times };
}

async function main() {
  const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  const commit = execSync('git rev-parse --short HEAD').toString().trim();
  
  console.log(`Running benchmarks on branch: ${branch} (${commit})`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Node version: ${process.version}`);
  console.log(`Platform: ${process.platform} ${process.arch}`);
  console.log('================================================\n');
  
  // Ensure dist is up to date
  console.log('Building project...');
  execSync('npm run build', { stdio: 'inherit' });
  console.log('Build complete.\n');
  
  const results = {
    branch,
    commit,
    date: new Date().toISOString(),
    nodeVersion: process.version,
    platform: `${process.platform} ${process.arch}`,
    commands: []
  };
  
  // Measure base startup time (just --help)
  console.log('Measuring base startup time...');
  const baseResult = measureCommand('--help');
  results.baseStartup = baseResult;
  
  // Measure each command
  for (const command of commands) {
    const result = measureCommand(command);
    results.commands.push(result);
  }
  
  // Calculate overall average
  const validResults = results.commands.filter(r => r.avg !== null);
  const overallAvg = validResults.reduce((sum, r) => sum + r.avg, 0) / validResults.length;
  results.overallAverage = overallAvg;
  
  // Write results to file
  const outputFile = `benchmark-results-${branch.replace(/\//g, '-')}-${commit}.json`;
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  
  console.log('================================================');
  console.log(`Overall average: ${overallAvg.toFixed(2)}ms`);
  console.log(`Results written to: ${outputFile}`);
  
  // Create summary table
  console.log('\nSummary Table:');
  console.log('| Command | Avg (ms) | Min (ms) | Max (ms) |');
  console.log('|---------|----------|----------|----------|');
  console.log(`| base (--help) | ${baseResult.avg?.toFixed(2) || 'N/A'} | ${baseResult.min?.toFixed(2) || 'N/A'} | ${baseResult.max?.toFixed(2) || 'N/A'} |`);
  for (const result of results.commands) {
    console.log(`| ${result.command} | ${result.avg?.toFixed(2) || 'N/A'} | ${result.min?.toFixed(2) || 'N/A'} | ${result.max?.toFixed(2) || 'N/A'} |`);
  }
}

main().catch(console.error);