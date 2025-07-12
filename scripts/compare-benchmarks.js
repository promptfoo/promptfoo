#!/usr/bin/env node
const fs = require('fs');

// Load benchmark results
const originalResults = JSON.parse(fs.readFileSync('scripts/benchmark-results-original.json', 'utf8'));
const optimizedResults = JSON.parse(fs.readFileSync('scripts/benchmark-results-optimized.json', 'utf8'));

// Create a map for easy lookup
const originalMap = {};
originalResults.results.forEach(r => {
  originalMap[r.cmd] = r;
});

const optimizedMap = {};
optimizedResults.results.forEach(r => {
  optimizedMap[r.cmd] = r;
});

// Calculate improvements
const comparisons = [];
for (const cmd of Object.keys(originalMap)) {
  if (optimizedMap[cmd]) {
    const original = originalMap[cmd];
    const optimized = optimizedMap[cmd];
    const improvement = ((original.avg - optimized.avg) / original.avg) * 100;
    const speedup = original.avg / optimized.avg;
    
    comparisons.push({
      cmd,
      description: original.description,
      originalAvg: original.avg,
      originalMin: original.min,
      originalMax: original.max,
      optimizedAvg: optimized.avg,
      optimizedMin: optimized.min,
      optimizedMax: optimized.max,
      improvement,
      speedup
    });
  }
}

// Sort by improvement percentage
comparisons.sort((a, b) => b.improvement - a.improvement);

// Generate markdown report
let report = `# CLI Performance Optimization Results

## Summary

The lazy loading optimizations have resulted in significant performance improvements across all commands.

- **Average improvement**: ${(comparisons.reduce((sum, c) => sum + c.improvement, 0) / comparisons.length).toFixed(1)}%
- **Average speedup**: ${(comparisons.reduce((sum, c) => sum + c.speedup, 0) / comparisons.length).toFixed(1)}x faster

## Benchmark Details

- **Test Environment**: Production build (compiled JavaScript from \`dist/src/main.js\`)
- **Methodology**: 5 iterations per command with 1 warmup run
- **Date**: ${new Date().toISOString().split('T')[0]}

## Performance Comparison Table

| Command | Original (ms) | Optimized (ms) | Improvement | Speedup |
|---------|---------------|----------------|-------------|---------|
`;

// Add each command to the table
comparisons.forEach(c => {
  report += `| \`${c.cmd}\` | ${c.originalAvg.toFixed(0)} | ${c.optimizedAvg.toFixed(0)} | ${c.improvement.toFixed(1)}% | ${c.speedup.toFixed(1)}x |\n`;
});

// Add detailed analysis
report += `
## Detailed Analysis

### Biggest Improvements

1. **${comparisons[0].cmd}**: ${comparisons[0].improvement.toFixed(1)}% improvement (${comparisons[0].originalAvg.toFixed(0)}ms → ${comparisons[0].optimizedAvg.toFixed(0)}ms)
2. **${comparisons[1].cmd}**: ${comparisons[1].improvement.toFixed(1)}% improvement (${comparisons[1].originalAvg.toFixed(0)}ms → ${comparisons[1].optimizedAvg.toFixed(0)}ms)
3. **${comparisons[2].cmd}**: ${comparisons[2].improvement.toFixed(1)}% improvement (${comparisons[2].originalAvg.toFixed(0)}ms → ${comparisons[2].optimizedAvg.toFixed(0)}ms)

### Key Optimizations Applied

1. **Lazy Loading**: Commands are now loaded only when needed using dynamic \`import()\`
2. **Deferred Initialization**: Database migrations and update checks are skipped for help commands
3. **Early Exit**: Help and version commands exit immediately without loading unnecessary modules
4. **Config Caching**: Configuration loading is cached to avoid redundant file reads

### Performance Ranges

#### Original Version
- **Fastest**: ${Math.min(...comparisons.map(c => c.originalAvg)).toFixed(0)}ms
- **Slowest**: ${Math.max(...comparisons.map(c => c.originalAvg)).toFixed(0)}ms
- **Average**: ${(comparisons.reduce((sum, c) => sum + c.originalAvg, 0) / comparisons.length).toFixed(0)}ms

#### Optimized Version
- **Fastest**: ${Math.min(...comparisons.map(c => c.optimizedAvg)).toFixed(0)}ms
- **Slowest**: ${Math.max(...comparisons.map(c => c.optimizedAvg)).toFixed(0)}ms
- **Average**: ${(comparisons.reduce((sum, c) => sum + c.optimizedAvg, 0) / comparisons.length).toFixed(0)}ms

## Raw Benchmark Data

### Original Version (Before Optimization)

\`\`\`json
${JSON.stringify(originalResults.results, null, 2)}
\`\`\`

### Optimized Version (After Optimization)

\`\`\`json
${JSON.stringify(optimizedResults.results, null, 2)}
\`\`\`

## Conclusion

The lazy loading optimizations have successfully reduced CLI startup times by an average of **${(comparisons.reduce((sum, c) => sum + c.improvement, 0) / comparisons.length).toFixed(1)}%**, making the CLI **${(comparisons.reduce((sum, c) => sum + c.speedup, 0) / comparisons.length).toFixed(1)}x faster** on average.

The most significant improvements were seen in commands that previously loaded all modules eagerly. The \`--help\` command, while showing less relative improvement, still benefits from not running expensive initialization operations like database migrations and update checks.

These optimizations ensure a much better user experience, especially for quick operations like checking help or version information.
`;

// Write the report
fs.writeFileSync('PERFORMANCE_BENCHMARK_REPORT.md', report);
console.log('Performance benchmark report generated: PERFORMANCE_BENCHMARK_REPORT.md');

// Also output a summary to console
console.log('\nSummary:');
console.log(`Average improvement: ${(comparisons.reduce((sum, c) => sum + c.improvement, 0) / comparisons.length).toFixed(1)}%`);
console.log(`Average speedup: ${(comparisons.reduce((sum, c) => sum + c.speedup, 0) / comparisons.length).toFixed(1)}x`);
console.log('\nTop 3 improvements:');
comparisons.slice(0, 3).forEach((c, i) => {
  console.log(`${i + 1}. ${c.cmd}: ${c.improvement.toFixed(1)}% (${c.speedup.toFixed(1)}x faster)`);
}); 