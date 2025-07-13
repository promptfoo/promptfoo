#!/usr/bin/env node
const fs = require('fs');

const mainResults = JSON.parse(fs.readFileSync('benchmark-results-main-9a44b0bfe.json', 'utf-8'));
const featureResults = JSON.parse(fs.readFileSync('benchmark-results-feat-lazy-load-cli-commands-987353a43.json', 'utf-8'));

console.log('# Benchmark Comparison: Main vs Lazy Loading Implementation\n');
console.log('## Summary');
console.log(`- Main branch average: **${mainResults.overallAverage.toFixed(2)}ms**`);
console.log(`- Feature branch average: **${featureResults.overallAverage.toFixed(2)}ms**`);
console.log(`- **Overall improvement: ${((mainResults.overallAverage - featureResults.overallAverage) / mainResults.overallAverage * 100).toFixed(1)}%**\n`);

console.log('## Detailed Comparison\n');
console.log('| Command | Main (ms) | Feature (ms) | Improvement | % Change |');
console.log('|---------|-----------|--------------|-------------|----------|');

// Base startup
const mainBase = mainResults.baseStartup.avg;
const featureBase = featureResults.baseStartup.avg;
const baseImprovement = mainBase - featureBase;
const basePercent = (baseImprovement / mainBase * 100).toFixed(1);
console.log(`| base (--help) | ${mainBase.toFixed(2)} | ${featureBase.toFixed(2)} | ${baseImprovement.toFixed(2)}ms | ${basePercent}% |`);

// Compare each command
const commandMap = new Map();
mainResults.commands.forEach(cmd => commandMap.set(cmd.command, { main: cmd }));
featureResults.commands.forEach(cmd => {
  const existing = commandMap.get(cmd.command) || {};
  existing.feature = cmd;
  commandMap.set(cmd.command, existing);
});

let totalImprovement = 0;
let commandCount = 0;

commandMap.forEach((data, command) => {
  if (data.main && data.feature && data.main.avg && data.feature.avg) {
    const improvement = data.main.avg - data.feature.avg;
    const percent = (improvement / data.main.avg * 100).toFixed(1);
    console.log(`| ${command} | ${data.main.avg.toFixed(2)} | ${data.feature.avg.toFixed(2)} | ${improvement.toFixed(2)}ms | ${percent}% |`);
    totalImprovement += parseFloat(percent);
    commandCount++;
  }
});

console.log('\n## Key Findings\n');

// Find biggest improvements
const improvements = [];
commandMap.forEach((data, command) => {
  if (data.main && data.feature && data.main.avg && data.feature.avg) {
    const improvement = data.main.avg - data.feature.avg;
    const percent = (improvement / data.main.avg * 100);
    improvements.push({ command, improvement, percent });
  }
});

improvements.sort((a, b) => b.percent - a.percent);

console.log('### Top 5 Most Improved Commands:');
improvements.slice(0, 5).forEach((item, i) => {
  console.log(`${i + 1}. **${item.command}**: ${item.percent.toFixed(1)}% faster (${item.improvement.toFixed(0)}ms improvement)`);
});

console.log('\n### Commands with Minimal Change:');
improvements.slice(-3).forEach(item => {
  if (item.percent < 5) {
    console.log(`- **${item.command}**: ${item.percent.toFixed(1)}% change`);
  }
});

// Overall stats
console.log('\n## Overall Statistics\n');
console.log(`- Average improvement per command: ${(totalImprovement / commandCount).toFixed(1)}%`);
console.log(`- Total commands benchmarked: ${commandCount}`);
console.log(`- Commands showing improvement: ${improvements.filter(i => i.percent > 0).length}`);
console.log(`- Commands showing regression: ${improvements.filter(i => i.percent < 0).length}`);