---
sidebar_position: 22
sidebar_label: Test generation
title: Test Generation
description: Automatically generate test datasets and assertions with edge cases, diversity optimization, and coverage analysis.
keywords: [test generation, synthetic data, assertions, edge cases, diversity, coverage]
---

# Test generation

Promptfoo can automatically generate comprehensive test suites including diverse datasets and intelligent assertions. Use the `generate` commands to create test cases, assertions, or both.

## Quick start

Generate a complete test suite from your prompts:

```bash
promptfoo generate tests -c promptfooconfig.yaml -o tests.yaml
```

## Commands

| Command               | Purpose                   |
| --------------------- | ------------------------- |
| `generate dataset`    | Create diverse test cases |
| `generate assertions` | Create test assertions    |
| `generate tests`      | Generate both together    |

## Dataset generation

Generate diverse test cases based on your prompts:

```bash
promptfoo generate dataset
```

### How it works

1. **Concept extraction** - Analyzes prompts to identify topics, entities, and constraints
2. **Persona generation** - Creates diverse user personas (demographic, behavioral, role-based)
3. **Test case synthesis** - Generates test cases for each persona
4. **Edge cases** - Optionally adds boundary conditions and edge cases
5. **Diversity check** - Measures semantic diversity and fills gaps

### Options

| Option                         | Description                                                    |
| ------------------------------ | -------------------------------------------------------------- |
| `--numPersonas <n>`            | Number of personas (default: 5)                                |
| `--numTestCasesPerPersona <n>` | Cases per persona (default: 3)                                 |
| `--enhanced`                   | Use enhanced generation with concepts, personas, and diversity |
| `--edge-cases`                 | Include edge case generation                                   |
| `--diversity`                  | Enable diversity measurement and optimization                  |
| `--diversity-target <n>`       | Target diversity score 0-1 (default: 0.7)                      |
| `--iterative`                  | Iteratively fill coverage gaps                                 |

:::note
When using `--edge-cases` or `--diversity`, the `--enhanced` mode is automatically enabled.
:::

### Edge case types

When `--edge-cases` is enabled, the system generates:

| Type          | Description                          |
| ------------- | ------------------------------------ |
| boundary      | Min/max values, numeric limits       |
| format        | Invalid formats, encoding variations |
| empty         | Empty strings, null-like values      |
| special-chars | Unicode, emojis, escape sequences    |
| length        | Very long and very short inputs      |

### Example

```bash
# Generate diverse dataset with edge cases
promptfoo generate dataset --edge-cases --diversity -o tests.yaml
```

## Assertion generation

Generate test assertions that validate LLM outputs:

```bash
promptfoo generate assertions
```

### Assertion types

Use `--type` to specify the assertion style:

| Type         | Description                                 |
| ------------ | ------------------------------------------- |
| `pi`         | Prompt-based inference assertions (default) |
| `g-eval`     | G-Eval style numeric scoring                |
| `llm-rubric` | Rubric-based LLM grading                    |

### Options

| Option                | Description                                                   |
| --------------------- | ------------------------------------------------------------- |
| `--type <type>`       | Assertion type: pi, g-eval, llm-rubric                        |
| `--numAssertions <n>` | Number of assertions to generate (default: 5)                 |
| `--enhanced`          | Use enhanced generation with coverage analysis and validation |
| `--coverage`          | Enable coverage analysis to map assertions to requirements    |
| `--validate`          | Validate assertions against sample outputs                    |
| `--negative-tests`    | Generate negative test assertions (should-not patterns)       |

### Coverage analysis

With `--coverage`, the system:

- Extracts requirements from prompts (explicit and implied)
- Maps assertions to requirements
- Reports coverage score and gaps

### Negative tests

With `--negative-tests`, generates assertions like:

- **should-not-contain** - Banned phrases, competitor mentions
- **should-not-hallucinate** - Fake citations, made-up statistics
- **should-not-expose** - PII, system prompts, credentials

### Example

```bash
# Generate assertions with coverage analysis
promptfoo generate assertions --coverage --negative-tests -o assertions.yaml
```

## Combined generation

Generate both datasets and assertions together:

```bash
promptfoo generate tests
```

### Options

All dataset and assertion options are available, plus:

| Option              | Description               |
| ------------------- | ------------------------- |
| `--dataset-only`    | Skip assertion generation |
| `--assertions-only` | Skip dataset generation   |
| `--parallel`        | Run both in parallel      |

### Example

```bash
# Full test suite with all features
promptfoo generate tests --edge-cases --coverage --negative-tests -o output.yaml

# Just datasets with diversity optimization
promptfoo generate tests --dataset-only --diversity --diversity-target 0.8
```

## Common options

These options work with all generate commands:

| Option                      | Description                    |
| --------------------------- | ------------------------------ |
| `-c, --config <path>`       | Configuration file path        |
| `-o, --output <path>`       | Output file (.yaml or .csv)    |
| `-w, --write`               | Write directly to config file  |
| `--provider <provider>`     | LLM provider for generation    |
| `-i, --instructions <text>` | Custom generation instructions |
| `--no-cache`                | Disable caching                |
| `--env-file <path>`         | Path to .env file              |

## Output format

Generated test cases are output as YAML:

```yaml title="tests.yaml"
- vars:
    location: 'Tokyo, Japan'
- vars:
    location: 'rural Montana'
- vars:
    location: '' # edge case: empty input
```

When generating assertions, they're added to `defaultTest.assert`:

```yaml title="output.yaml"
tests:
  - vars:
      location: 'Paris'

defaultTest:
  assert:
    - type: llm-rubric
      value: 'Response should provide specific travel recommendations'
    - type: not-contains
      value: "I don't know"
```

## Programmatic usage

### Node.js SDK

```typescript
import { generation } from 'promptfoo';

const result = await generation.generateTestSuite(
  [{ raw: 'Act as a travel guide for {{location}}', label: 'travel' }],
  [],
  {
    dataset: {
      numPersonas: 5,
      edgeCases: { enabled: true },
      diversity: { enabled: true, targetScore: 0.7 },
    },
    assertions: {
      coverage: { enabled: true },
      negativeTests: { enabled: true },
    },
  },
);

console.log(result.dataset?.testCases);
console.log(result.assertions?.assertions);
```

### REST API

Start the server and use the generation endpoints:

```bash
# Start generation job
curl -X POST http://localhost:15500/api/generation/tests/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompts": [{"raw": "Act as a travel guide for {{location}}"}],
    "options": {
      "dataset": {"edgeCases": {"enabled": true}},
      "assertions": {"coverage": {"enabled": true}}
    }
  }'

# Check job status
curl http://localhost:15500/api/generation/tests/job/{jobId}
```

Jobs run asynchronously. Poll the job endpoint or use SSE streaming at `/api/generation/stream/{jobId}` for real-time updates.
