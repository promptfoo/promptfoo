# Performance Test: 1000 Test Cases

This example tests the Ink CLI UI with a large dataset to identify performance bottlenecks.

## Quick Start

```bash
# Run full test (1000 cases × 3 providers = 3000 evaluations)
npm run local -- eval -c examples/perf-test-1000/promptfooconfig.yaml --no-cache

# Run smaller subset for quick iteration
npm run local -- eval -c examples/perf-test-1000/promptfooconfig.yaml --filter-first-n 100 --no-cache

# Filter by metadata
npm run local -- eval -c examples/perf-test-1000/promptfooconfig.yaml --filter-metadata category=math --no-cache
```

## Test Case Distribution

The Python generator creates 1000 test cases with:

- **Outcomes**: 70% pass, 20% fail, 10% mixed
- **Content lengths**: 40% short, 40% medium, 20% long
- **Metadata**: category, difficulty, priority, batch, content_length

## What This Tests

1. **Table rendering performance** with 1000+ rows
2. **Filter performance** with large datasets
3. **Scroll performance** when navigating
4. **Memory usage** over time
5. **Summary statistics** calculation speed

## Expected Behavior

The UI should:
- Render smoothly without lag
- Filter quickly (< 100ms)
- Navigate without stuttering
- Not consume excessive memory
