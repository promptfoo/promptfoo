# named-metrics (Named Metrics)

You can run this example with:

```bash
npx promptfoo@latest init --example named-metrics
```

This example shows how to label metrics and surface them in the webview.

Run the test suite with:

```
promptfoo eval
```

## Features Demonstrated

1. **Static Metric Names**: Hardcoded metric names like `Tone` and `Consistency`
2. **Dynamic Metric Names**: Using template variables like `{{category}}` in `defaultTest.assert` to apply different metric names per test case
3. **Derived Metrics**: Creating custom metrics based on formulas (e.g., `DoubleConsistency = Consistency * 2`)
