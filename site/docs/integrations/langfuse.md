---
sidebar_label: Langfuse
description: Integrate Langfuse prompts and traces with Promptfoo for LLM testing. Evaluate stored traces, use version-controlled prompts, and sync evaluation scores back to Langfuse.
keywords:
  [langfuse, llm observability, traces, prompt management, production evaluation, llm monitoring]
---

# Langfuse integration

[Langfuse](https://langfuse.com) is an open-source LLM engineering platform for prompt management, tracing, and evaluation.

Promptfoo integrates with Langfuse in two ways:

| Integration | Use case                                                  |
| ----------- | --------------------------------------------------------- |
| **Prompts** | Pull version-controlled prompts from Langfuse for testing |
| **Traces**  | Evaluate production LLM outputs without re-running them   |

## Setup

1. Install the Langfuse SDK:

   ```bash
   npm install langfuse
   ```

2. Set environment variables (get keys from [Langfuse Settings](https://langfuse.com) → API Keys):

   ```bash
   export LANGFUSE_PUBLIC_KEY="pk-lf-..."
   export LANGFUSE_SECRET_KEY="sk-lf-..."
   export LANGFUSE_HOST="https://cloud.langfuse.com"  # or self-hosted URL
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

Use the `langfuse://traces` URL scheme to load traces from Langfuse and evaluate them with promptfoo assertions. This is useful for:

- **Production monitoring**: Run quality checks on live LLM outputs
- **Regression testing**: Build test suites from real user interactions
- **Cost analysis**: Verify spending is within budget
- **Compliance auditing**: Check for PII leakage or policy violations

### Quick start

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Evaluate production traces

# Load traces tagged 'production' from Langfuse
tests: langfuse://traces?tags=production&limit=50

# Run assertions on stored outputs (no LLM calls needed)
defaultTest:
  assert:
    - type: llm-rubric
      value: 'Response is helpful and on-topic'
    - type: cost
      threshold: 0.01
```

Run the evaluation:

```bash
npx promptfoo@latest eval
```

### How it works

1. Promptfoo fetches traces from the Langfuse API based on your filter parameters
2. Each trace is converted to a test case with the stored input/output
3. Assertions run against the stored output (no LLM re-execution)
4. Results show which traces pass or fail your quality criteria

### URL parameters

Filter traces using query parameters:

| Parameter       | Description                            | Example                    |
| --------------- | -------------------------------------- | -------------------------- |
| `limit`         | Maximum traces to fetch (default: 100) | `limit=50`                 |
| `tags`          | Filter by tags (comma-separated)       | `tags=production,gpt-4`    |
| `name`          | Filter by trace name                   | `name=chat-completion`     |
| `userId`        | Filter by user ID                      | `userId=user_123`          |
| `sessionId`     | Filter by session ID                   | `sessionId=sess_456`       |
| `fromTimestamp` | Start timestamp (ISO 8601)             | `fromTimestamp=2024-01-01` |
| `toTimestamp`   | End timestamp (ISO 8601)               | `toTimestamp=2024-12-31`   |
| `version`       | Filter by version                      | `version=1.0`              |
| `release`       | Filter by release                      | `release=v2.0.0`           |

Example with multiple filters:

```yaml
tests: langfuse://traces?tags=production&name=chat&fromTimestamp=2024-01-01&limit=200
```

### Available variables

Each trace becomes a test case with these variables available in assertions:

| Variable                | Description                  |
| ----------------------- | ---------------------------- |
| `input`                 | Extracted input text         |
| `output`                | Extracted output text        |
| `__langfuse_trace_id`   | Trace ID                     |
| `__langfuse_input`      | Full input object            |
| `__langfuse_output`     | Full output object           |
| `__langfuse_user_id`    | User ID                      |
| `__langfuse_session_id` | Session ID                   |
| `__langfuse_tags`       | Array of tags                |
| `__langfuse_metadata`   | Trace metadata               |
| `__langfuse_latency`    | Response latency (seconds)   |
| `__langfuse_cost`       | Cost in USD                  |
| `__langfuse_url`        | Link to trace in Langfuse UI |

The `input` and `output` variables are automatically extracted from common formats (string, `{query}`, `{prompt}`, `{response}`, `{result}`, etc.). For complex structures, use the full `__langfuse_input` and `__langfuse_output` objects.

### Examples

#### Quality monitoring

Sample recent production traces and check quality:

```yaml title="promptfooconfig.yaml"
description: Daily production quality check

tests: langfuse://traces?tags=production&limit=100&fromTimestamp=2024-01-01

defaultTest:
  assert:
    # Quality check
    - type: llm-rubric
      value: 'Response is helpful, accurate, and professional'

    # Safety check - no PII leakage
    - type: javascript
      value: |
        const piiPatterns = [
          /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,  // email
          /\b\d{3}-\d{2}-\d{4}\b/,                        // SSN
          /\b\d{16}\b/                                    // credit card
        ];
        return !piiPatterns.some(p => p.test(output));

    # Cost check
    - type: cost
      threshold: 0.05
```

#### Session continuity

Evaluate all turns in a conversation session:

```yaml title="promptfooconfig.yaml"
description: Session context evaluation

tests: langfuse://traces?sessionId=session_abc123

defaultTest:
  assert:
    - type: llm-rubric
      value: 'Response maintains context from earlier in the conversation'
```

#### Compare new prompt against production

Use real production inputs to test a new prompt version:

```yaml title="promptfooconfig.yaml"
description: A/B test new prompt against production baseline

prompts:
  - langfuse://my-prompt@production
  - langfuse://my-prompt@experiment-v2

providers:
  - openai:gpt-4o

# Use production trace inputs as test data
tests: langfuse://traces?tags=production&limit=50

defaultTest:
  assert:
    - type: similar
      value: '{{output}}' # Compare to stored output
      threshold: 0.8
```

#### Filter by user segment

Evaluate traces from specific user cohorts:

```yaml title="promptfooconfig.yaml"
description: Enterprise user quality check

tests: langfuse://traces?tags=enterprise,production&limit=100

defaultTest:
  assert:
    - type: llm-rubric
      value: 'Response meets enterprise quality standards'
```

#### Time-based regression testing

Compare this week's outputs to last week's:

```yaml title="promptfooconfig.yaml"
description: Weekly regression check

tests: langfuse://traces?tags=production&fromTimestamp=2024-12-09&toTimestamp=2024-12-16&limit=200

defaultTest:
  assert:
    - type: llm-rubric
      value: 'Response quality is consistent with expectations'
    - type: latency
      threshold: 5000 # 5 seconds max
```

### Using with the echo provider

For assertion-only evaluation without re-running prompts, use the `echo` provider to pass through the stored output:

```yaml title="promptfooconfig.yaml"
description: Assertion-only evaluation

prompts:
  - '{{input}}'

providers:
  - id: echo
    config:
      text: '{{output}}'

tests: langfuse://traces?tags=production&limit=100

defaultTest:
  assert:
    - type: contains
      value: 'helpful'
```

### Viewing results

After running an eval, view results in the promptfoo UI:

```bash
npx promptfoo@latest view
```

Each test case links back to the original trace in Langfuse via the `__langfuse_url` variable, making it easy to investigate failures.

### Supported input/output formats

The `input` and `output` variables are automatically extracted from these common LLM formats:

| Format                | Input extraction                                       | Output extraction                                             |
| --------------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| **String**            | Used directly                                          | Used directly                                                 |
| **OpenAI chat**       | Last user message content from `messages[]`            | `choices[0].message.content`                                  |
| **OpenAI completion** | -                                                      | `choices[0].text`                                             |
| **Anthropic**         | Text from content blocks                               | `content[0].text` or `content` string                         |
| **Simple objects**    | `query`, `prompt`, `message`, `input`, or `text` field | `response`, `output`, `result`, `completion`, or `text` field |

For formats not listed above, the full object is used. Access raw data via `__langfuse_input` and `__langfuse_output`.

### Troubleshooting

**Authentication failed (401)**

```text
Langfuse authentication failed. Check your LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, and LANGFUSE_BASE_URL environment variables.
```

Verify your credentials:

- Keys are from the correct Langfuse project
- Using the right host (`https://cloud.langfuse.com` for cloud, `https://us.cloud.langfuse.com` for US region)
- Environment variables are properly exported

**No traces found**

If traces exist in Langfuse but aren't being loaded:

- Check filter parameters match your traces (tags, name, timestamps)
- Verify traces have both `input` and `output` populated
- Try removing filters to fetch all traces: `langfuse://traces?limit=10`

**Empty input/output variables**

If `input` or `output` are empty but `__langfuse_input`/`__langfuse_output` have data:

- Your trace format may not match auto-extraction patterns
- Use `__langfuse_input` and `__langfuse_output` directly in assertions
- Or extract with JavaScript: `{{__langfuse_output.your_field}}`
