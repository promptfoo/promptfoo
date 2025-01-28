# Retry Previous Tests

The `retry-previous` strategy helps you continuously monitor and validate your model's behavior by automatically retrying test cases that previously succeeded in generating undesirable outputs. This is particularly valuable for red teaming because when a test case successfully "breaks" your model's safeguards, you'll want to keep testing that specific probe to ensure your model remains robust against it over time.

## How it Works

The strategy works by:
1. Looking at your current test suite's plugin IDs (e.g., `harmful:hate`, `harmful:illegal`)
2. Finding previous test cases that "succeeded" (from a red teaming perspective) in generating undesirable outputs with those exact plugins
3. Adding those test cases back into your test suite

This means the strategy will only add retry tests when:
- You have previously run red team tests with the same plugin IDs
- Those previous tests successfully generated undesirable outputs (i.e., "failed" from a safety perspective)
- You're using the same target model ID as the previous tests

## Configuration

```yaml
redteam:
  strategies:
    - id: retry-previous
      config:
        # Number of tests to retry per plugin (default: 5)
        testsPerPlugin: 5
        
        # Optional: Only retry tests that failed with specific failure reasons
        failureReasons: []
        
        # Optional: Plugin-specific retry counts
        plugins:
          - id: harmful:hate
            numTests: 10
          - id: harmful:illegal
            numTests: 3
```

## Example

Let's say you have a test suite with two plugins:

```yaml
redteam:
  plugins:
    - id: harmful:hate
      numTests: 5
    - id: harmful:illegal
      numTests: 5
  strategies:
    - id: retry-previous
      config:
        testsPerPlugin: 3
```

This configuration will:
1. Generate 5 new test cases for each plugin (10 total)
2. Find and retry up to 3 previously successful red team probes for each plugin
3. Track metadata about the original test run for analysis

## Why Retry Previous Tests?

There are several important reasons to retry previously successful red team probes:

1. **Regression Testing**: Ensure that your model's safety improvements don't regress over time. If a probe previously succeeded in generating harmful content, you want to verify that your model now handles it appropriately.

2. **Model Consistency**: Check if your model's safety boundaries are stable. A model that sometimes allows and sometimes blocks the same harmful prompt might indicate underlying issues with its safety mechanisms.

3. **Continuous Monitoring**: As you update your model or safety measures, previously problematic inputs serve as excellent test cases. They help you verify that your improvements are working as intended.

4. **Edge Case Discovery**: Previously successful red team probes often represent edge cases or clever bypasses. Keeping these in your test suite helps maintain a comprehensive safety evaluation.

## Use Cases

- Validating model safety improvements
- Monitoring for safety regressions
- Building a repository of known edge cases
- Continuous safety assessment across model versions 