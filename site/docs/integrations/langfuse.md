---
sidebar_label: Langfuse
description: Integrate Langfuse prompts and traces with Promptfoo for LLM testing. Evaluate stored traces, use version-controlled prompts, and sync evaluation scores back to Langfuse.
---

# Langfuse integration

[Langfuse](https://langfuse.com) is an open-source LLM engineering platform that includes collaborative prompt management, tracing, and evaluation capabilities.

Promptfoo integrates with Langfuse in two ways:

1. **Prompts**: Use prompts stored in Langfuse with version control and labels
2. **Traces**: Evaluate LLM outputs stored in Langfuse traces without re-running them

## Setup

1. Install the langfuse SDK:

   ```bash
   npm install langfuse
   ```

2. Set the required environment variables:
   ```bash
   export LANGFUSE_PUBLIC_KEY="your-public-key"
   export LANGFUSE_SECRET_KEY="your-secret-key"
   export LANGFUSE_HOST="https://cloud.langfuse.com"  # or your self-hosted URL
   ```

## Using Langfuse prompts

Use the `langfuse://` prefix in your promptfoo configuration to reference prompts managed in Langfuse.

### Prompt formats

You can reference prompts by version or label using two different syntaxes:

#### 1. Explicit @ syntax (recommended for clarity)

```yaml
# By label
langfuse://prompt-name@label:type

# Examples
langfuse://my-prompt@production        # Text prompt with production label
langfuse://chat-prompt@staging:chat    # Chat prompt with staging label
```

#### 2. Auto-detection with : syntax

```yaml
# By version or label (auto-detected)
langfuse://prompt-name:version-or-label:type
```

The parser automatically detects:

- **Numeric values** → treated as versions (e.g., `1`, `2`, `3`)
- **String values** → treated as labels (e.g., `production`, `staging`, `latest`)

Where:

- `prompt-name`: The name of your prompt in Langfuse
- `version`: Specific version number (e.g., `1`, `2`, `3`)
- `label`: Label assigned to a prompt version (e.g., `production`, `staging`, `latest`)
- `type`: Either `text` or `chat` (defaults to `text` if omitted)

### Examples

```yaml
prompts:
  # Explicit @ syntax for labels (recommended)
  - 'langfuse://my-prompt@production' # Production label, text prompt
  - 'langfuse://chat-prompt@staging:chat' # Staging label, chat prompt
  - 'langfuse://my-prompt@latest:text' # Latest label, text prompt

  # Auto-detection with : syntax
  - 'langfuse://my-prompt:production' # String → treated as label
  - 'langfuse://chat-prompt:staging:chat' # String → treated as label
  - 'langfuse://my-prompt:latest' # "latest" → treated as label

  # Version references (numeric values only)
  - 'langfuse://my-prompt:3:text' # Numeric → version 3
  - 'langfuse://chat-prompt:2:chat' # Numeric → version 2

providers:
  - openai:gpt-5-mini

tests:
  - vars:
      user_query: 'What is the capital of France?'
      context: 'European geography'
```

### Variable substitution

Variables from your promptfoo test cases are automatically passed to Langfuse prompts. If your Langfuse prompt contains variables like `{{user_query}}` or `{{context}}`, they will be replaced with the corresponding values from your test cases.

### Label-based deployment

Using labels is recommended for production scenarios as it allows you to:

- Deploy new prompt versions without changing your promptfoo configuration
- Use different prompts for different environments (production, staging, development)
- A/B test different prompt versions
- Roll back to previous versions quickly in Langfuse

Common label patterns:

- `production` - Current production version
- `staging` - Testing before production
- `latest` - Most recently created version
- `experiment-a`, `experiment-b` - A/B testing
- `tenant-xyz` - Multi-tenant scenarios

### Best practices

1. **Use labels instead of version numbers** for production deployments to avoid hardcoding version numbers in your config
2. **Use descriptive prompt names** that clearly indicate their purpose
3. **Test prompts in staging** before promoting them to production
4. **Version control your promptfoo configs** even though prompts are managed in Langfuse

### Limitations

- While prompt IDs containing `@` symbols are supported, we recommend avoiding them for clarity. The parser looks for the last `@` followed by a label pattern to distinguish between the prompt ID and label.
- If you need to use `@` in your label names, consider using a different naming convention.

## Evaluating Langfuse traces

Use the `langfuse://traces` URL scheme to load traces from Langfuse and evaluate them with promptfoo assertions. This enables you to:

- Evaluate LLM outputs already stored in Langfuse without re-running them
- Run quality checks on production traces
- Build regression test suites from historical data

### Basic usage

```yaml
# Evaluate traces with assertions (no LLM re-execution needed)
tests: langfuse://traces?tags=production&limit=50

defaultTest:
  assert:
    - type: llm-rubric
      value: 'Response is helpful and accurate'
    - type: cost
      threshold: 0.01
```

### URL parameters

| Parameter       | Description                            | Example                          |
| --------------- | -------------------------------------- | -------------------------------- |
| `limit`         | Maximum traces to fetch (default: 100) | `limit=50`                       |
| `userId`        | Filter by user ID                      | `userId=user_123`                |
| `sessionId`     | Filter by session ID                   | `sessionId=sess_456`             |
| `tags`          | Filter by tags (comma-separated)       | `tags=production,gpt-4`          |
| `name`          | Filter by trace name                   | `name=chat-completion`           |
| `fromTimestamp` | Start timestamp (ISO 8601)             | `fromTimestamp=2024-01-01`       |
| `toTimestamp`   | End timestamp (ISO 8601)               | `toTimestamp=2024-01-31`         |
| `version`       | Filter by version                      | `version=1.0`                    |
| `release`       | Filter by release                      | `release=v2.0.0`                 |

### Available variables

Each trace is converted to a test case with these variables:

```yaml
vars:
  # Convenient access to main content
  input: '...' # Extracted from trace input
  output: '...' # Extracted from trace output

  # Full Langfuse data (prefixed to avoid collisions)
  __langfuse_trace_id: 'abc123'
  __langfuse_input: { query: '...' }
  __langfuse_output: { response: '...' }
  __langfuse_user_id: 'user_123'
  __langfuse_session_id: 'session_456'
  __langfuse_tags: ['production']
  __langfuse_metadata: { ... }
  __langfuse_latency: 0.5
  __langfuse_cost: 0.001
  __langfuse_url: 'https://...'
```

### Assertion-only evaluation

When you load traces without specifying prompts or providers, promptfoo evaluates the stored outputs directly:

```yaml
# No prompts or providers - evaluates stored outputs
tests: langfuse://traces?tags=production&limit=100

defaultTest:
  assert:
    - type: contains
      value: 'helpful'
    - type: llm-rubric
      value: 'Response answers the question'
```

### Comparing against new prompts

You can also compare stored trace inputs against new prompt versions:

```yaml
prompts:
  - langfuse://my-prompt@experiment-v2

providers:
  - openai:gpt-4o

# Use trace inputs as test data
tests: langfuse://traces?tags=production&limit=50

defaultTest:
  assert:
    - type: similar
      value: '{{output}}' # Compare to stored output
      threshold: 0.8
```

### Example: Quality monitoring

```yaml
# Monitor production quality by sampling recent traces
tests: langfuse://traces?tags=production&limit=100&fromTimestamp=2024-01-01

defaultTest:
  assert:
    # Check response quality
    - type: llm-rubric
      value: 'Response is helpful, accurate, and professional'

    # Check for PII leakage
    - type: not-contains
      value: '@example.com'

    # Verify cost is reasonable
    - type: cost
      threshold: 0.05
```

### Example: Session evaluation

Evaluate all traces from a specific conversation session:

```yaml
tests: langfuse://traces?sessionId=session_abc123

defaultTest:
  assert:
    - type: llm-rubric
      value: 'Response maintains context from the conversation'
```
