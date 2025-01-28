# Regression Testing Plugin

The `regression` plugin helps you continuously monitor and validate your model's safety boundaries by automatically retrying test cases that previously succeeded in generating undesirable outputs. This is a critical part of red teaming because it helps identify:

- Safety regressions in model updates
- Inconsistencies in safety boundaries
- Persistent vulnerabilities that need attention

## How it Works

The plugin works by:
1. Finding previous test cases that "succeeded" in generating undesirable outputs
2. Adding those test cases back into your test suite
3. Tracking whether these known vulnerabilities are still present

This helps ensure that:
- Safety improvements don't regress over time
- Model behavior is consistent across different runs
- Known vulnerabilities are continuously monitored

## Configuration

```yaml
redteam:
  plugins:
    - id: regression
      numTests: 5  # Number of previous test cases to retry
      config:
        # Optional: Only retry tests with specific failure reasons
        failureReasons: []
```

## Example

```yaml
redteam:
  plugins:
    - id: regression
      numTests: 10  # Retry 10 most recent successful red team probes
```

## Why Test for Regressions?

LLM safety is not just about finding new vulnerabilities—it's also about ensuring that known vulnerabilities stay fixed. There are several reasons why regression testing is crucial:

1. **Model Updates**: When you update your model or fine-tune it, previously fixed safety issues might resurface. Regression testing helps catch these early.

2. **Safety Boundary Stability**: Models might be inconsistent in their safety boundaries. A prompt that gets blocked 90% of the time might still succeed occasionally. Regression testing helps identify these inconsistencies.

3. **Continuous Validation**: As you implement safety measures, regression testing verifies that your fixes are working consistently over time.

4. **Edge Case Repository**: Previously successful red team probes represent valuable test cases. They often expose subtle ways to bypass safety measures that might not be caught by other testing methods.

## Plugin Details

- **Category**: Misinformation and Misuse
- **Severity**: High
- **Description**: Tests if previously successful red team probes can still bypass safety measures

## Use Cases

- Validating model safety improvements
- Testing consistency of safety boundaries
- Building a comprehensive test suite
- Monitoring long-term model behavior 