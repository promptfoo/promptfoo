# Scripts

This directory contains utility scripts for the promptfoo project.

## benchmark-startup.js

A performance benchmarking script that measures CLI startup times for various commands.

### Usage

```bash
# Run the benchmark
node scripts/benchmark-startup.js

# Or if you have made it executable
./scripts/benchmark-startup.js
```

### What it measures

The script tests startup performance for:
- `--help` - Basic help command (should be fastest)
- `--version` - Version display
- `init --help` - Command-specific help
- `eval --help` - Complex command help
- `redteam --help` - Subcommand help

### Output

The script provides:
- Average, min, and max times for each command
- Detailed timing for each run
- A summary showing fastest/slowest commands
- Comparison with compiled version (if available)

### Performance Optimization

This script is useful for:
1. Establishing baseline performance before optimizations
2. Measuring the impact of lazy loading and other optimizations
3. Identifying which commands are slowest to start
4. Comparing TypeScript vs compiled JavaScript performance

### Example Output

```
Benchmarking promptfoo CLI startup times...
Running 5 iterations per command after 1 warmup

Testing "--help" - Help command (should be fastest)... ✓
Testing "--version" - Version command... ✓
...

================================================================================
RESULTS (all times in milliseconds)
================================================================================

Command: --help
Description: Help command (should be fastest)
Average: 203ms
Min: 195ms, Max: 215ms
All runs: 195ms, 198ms, 203ms, 207ms, 215ms

...
``` 