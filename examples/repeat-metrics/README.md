# repeat-metrics (Measuring LLM Consistency with Repeated Tests)

This example demonstrates how to measure LLM consistency by running tests multiple times and calculating statistical metrics like pass^N, flip rates, and score variance.

## What This Shows

- Running tests multiple times with `--repeat N`
- Using post-processing derived metrics to calculate statistics
- Measuring the probability that all N attempts succeed (pass^N)
- Detecting flaky/inconsistent LLM behavior

## Use Case

When evaluating LLMs, a single test run might not reveal consistency issues. By repeating tests multiple times, you can:

1. **Measure reliability**: What's the probability ALL attempts succeed? (pass^N)
2. **Detect flakiness**: How often does the same test flip between pass/fail?
3. **Quantify variance**: How much do scores vary across repeated runs?
4. **Identify edge cases**: Which tests are most inconsistent?

## Quick Start

Run the evaluation with repeat enabled:

```bash
npx promptfoo@latest init --example repeat-metrics
cd repeat-metrics
npx promptfoo@latest eval --repeat 5
```

## Configuration Explained

The key parts of `promptfooconfig.yaml`:

```yaml
derivedMetrics:
  - name: repeat_stats
    value: file://./node_modules/promptfoo/dist/src/metrics/repeatStats.js
    phase: post
```

- **`phase: post`** - Runs after all test results are collected (not during evaluation)
- **Built-in function** - `repeatStats.js` is included with promptfoo
- **Automatic calculation** - When `--repeat > 1`, calculates consistency metrics

## Metrics Calculated

When you run with `--repeat N`, these metrics are automatically calculated:

| Metric | Description |
|--------|-------------|
| `repeat.pass_n` | Probability that ALL N attempts pass (pessimistic) |
| `repeat.pass_rate` | Overall pass rate across all attempts |
| `repeat.flip_rate` | How often pass/fail status changes between attempts |
| `repeat.score.mean` | Average score across all attempts |
| `repeat.score.stddev` | Standard deviation of scores (consistency measure) |
| `repeat.score.min` | Lowest score observed |
| `repeat.score.max` | Highest score observed |
| `repeat.latency.mean` | Average response time |
| `repeat.latency.p95` | 95th percentile latency |
| `repeat.latency.p99` | 99th percentile latency |

## Understanding pass^N vs pass@k

**pass^N (this metric)**:
- "What's the probability ALL N attempts succeed?"
- Formula: `(pass_rate)^N`
- Example: If 2/3 attempts pass, pass^3 = (0.667)^3 = 0.296 (29.6%)
- **Pessimistic** - Good for reliability requirements

**pass@k (different metric)**:
- "What's the probability AT LEAST ONE of k attempts succeeds?"
- Not calculated by this metric
- **Optimistic** - Good for sampling/generation tasks

## Example Output

```
Repeat Statistics:
┌─────────────────────────────┬────────────┐
│ Metric                      │ Value      │
├─────────────────────────────┼────────────┤
│ repeat.pass_n               │ 0.6400     │
│ repeat.pass_rate            │ 0.8667     │
│ repeat.flip_rate            │ 0.3333     │
│ repeat.score.mean           │ 0.7833     │
│ repeat.score.stddev         │ 0.1527     │
│ repeat.score.min            │ 0.5000     │
│ repeat.score.max            │ 1.0000     │
│ repeat.latency.mean         │ 234.5000   │
│ repeat.latency.p95          │ 312.0000   │
│ repeat.latency.p99          │ 315.0000   │
└─────────────────────────────┴────────────┘
```

## Custom Post-Processing Metrics

You can also create custom post-processing metrics. Create a JavaScript file:

```javascript
// customMetric.js
module.exports = function(context) {
  const { results, options } = context;

  // Your custom calculation
  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

  // Return metrics as key-value pairs
  return {
    'custom.avg_score': avgScore,
    'custom.total_tests': results.length,
  };
};
```

Add to config:

```yaml
derivedMetrics:
  - name: my_custom_metric
    value: file://./customMetric.js
    phase: post
```

## When to Use Repeat Testing

**Good use cases:**
- Evaluating non-deterministic models (temperature > 0)
- Detecting flaky prompts or test cases
- Measuring production reliability
- Comparing model consistency

**Not needed when:**
- Using deterministic models (temperature = 0)
- Only care about "best of N" performance (use sampling instead)
- Running large-scale evals (use `--filter-sample` instead)

## Related Examples

- `examples/custom-metrics/` - Creating custom scoring metrics
- `examples/model-graded-eval/` - Using LLM-as-judge for evaluation

## Learn More

- [Derived Metrics Documentation](https://www.promptfoo.dev/docs/configuration/derived-metrics/)
- [GitHub Issue #5947](https://github.com/promptfoo/promptfoo/issues/5947) - Original feature request
