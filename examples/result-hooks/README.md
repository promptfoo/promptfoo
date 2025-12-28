# result-hooks (Process Evaluation Results)

This example shows how to use extension hooks to process evaluation results programmatically. Use this to:

- Send metrics to monitoring systems
- Trigger alerts based on success rates
- Export data to custom formats
- Integrate with CI/CD pipelines

## Quick Start

```bash
npx promptfoo@latest init --example result-hooks
npx promptfoo@latest eval
```

## Usage

### Via Configuration File

```yaml
# promptfooconfig.yaml
extensions:
  - file://result-handler.js:afterAll
```

### Via CLI Flag

```bash
# Run with a one-off extension
promptfoo eval -x file://result-handler.js:afterAll

# Combine with config file extensions
promptfoo eval -x file://alert-on-failure.js:afterAll
```

## Extension Hooks

Extensions support four lifecycle hooks:

| Hook         | When Called              | Use Case                           |
| ------------ | ------------------------ | ---------------------------------- |
| `beforeAll`  | Before evaluation starts | Modify test suite, validate config |
| `beforeEach` | Before each test case    | Customize test parameters          |
| `afterEach`  | After each test case     | Process individual results         |
| `afterAll`   | After all tests complete | Aggregate results, send reports    |

## afterAll Context

The `afterAll` hook receives:

```typescript
{
  evalId: string;              // Unique evaluation ID
  config: UnifiedConfig;       // Full evaluation configuration
  suite: TestSuite;            // Test suite that was evaluated
  results: EvaluateResult[];   // All individual test results
  prompts: CompletedPrompt[];  // Prompts with metrics
}
```

## Examples in this Directory

- `result-handler.js` - JavaScript handler with monitoring examples
- `result-handler.py` - Python handler with webhook integration
- `promptfooconfig.yaml` - Configuration using the extension
