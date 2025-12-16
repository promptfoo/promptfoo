# named-metrics (Named Metrics Example)

This example demonstrates custom metric naming and derivation in promptfoo.

## Setup

```bash
npx promptfoo@latest init --example named-metrics
```

## Run

```bash
promptfoo eval
```

## Features Demonstrated

1. **Dynamic Metric Names**: Using template variables like `{{speechStyle}}Style` in `defaultTest.assert` to apply different metric names per test case. This enables:
   - A single assertion definition that applies to all tests
   - Filtered results by the metric name that was dynamically generated

2. **Static Metric Names**: Hardcoded metric names like `Tone`, `Consistency`, and `Length`

3. **Derived Metrics**: Creating custom metrics based on formulas (e.g., `DoubleConsistency = Consistency * 2`)

## Dynamic Metric Example

```yaml
defaultTest:
  assert:
    - type: llm-rubric
      value: The response uses {{speechStyle}} speech patterns
      metric: '{{speechStyle}}Style'

tests:
  - vars:
      body: Ahoy there!
      speechStyle: pirate # Results in metric name "pirateStyle"

  - vars:
      body: Set sail!
      speechStyle: nautical # Results in metric name "nauticalStyle"
```

This allows you to maintain hundreds of test cases with a compact `defaultTest` configuration while still having unique, filterable metric names per test.
