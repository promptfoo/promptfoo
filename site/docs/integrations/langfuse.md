---
sidebar_label: Langfuse
description: Use Langfuse prompts and stored trace outputs in Promptfoo evals. Configure credentials, filter traces, and grade existing responses without replaying a model.
---

# Langfuse integration

[Langfuse](https://langfuse.com) is an open-source LLM engineering platform that includes collaborative prompt management, tracing, and evaluation capabilities.

## Setup

1. Install promptfoo and the optional Langfuse client SDK together in your project:

   ```bash
   npm install promptfoo @langfuse/client@^6.0.0
   ```

   The SDK is not installed by default. Run `npx promptfoo eval` from this project so promptfoo can resolve it. For a global installation, use `npm install -g promptfoo @langfuse/client@^6.0.0`.

   SDK v6 requires Langfuse Cloud or self-hosted Langfuse v4.59.0 or later. For older self-hosted servers, install `@langfuse/client@^5.11.1`, which remains supported. See the [Langfuse migration guide](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v5-to-v6).

2. Set the required environment variables:

   ```bash
   export LANGFUSE_PUBLIC_KEY="your-public-key"
   export LANGFUSE_SECRET_KEY="your-secret-key"
   export LANGFUSE_HOST="https://cloud.langfuse.com"  # or your self-hosted URL
   ```

   You can also set them in a file passed with `--env-file` or in your config's top-level `env` block. Both take precedence over variables exported in your shell.

   `LANGFUSE_BASE_URL`, the name the Langfuse SDK uses for the host, works in place of `LANGFUSE_HOST`. If both are set, `LANGFUSE_HOST` is used.

## Using Langfuse prompts

Use the `langfuse://` prefix in your promptfoo configuration to reference prompts managed in Langfuse.

To retrieve application traces from Langfuse during evals, configure the [`langfuse` external trace provider](/docs/tracing/#langfuse). Trace retrieval uses Langfuse's public API directly and does not require installing the Langfuse client SDK.

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
  - openai:gpt-6-luna

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

Use `langfuse://traces` as a test source to grade stored outputs. Install `@langfuse/client` and set the credentials described above.

```yaml title="promptfooconfig.yaml"
prompts:
  - '{{input}}'
providers:
  - echo
defaultTest:
  assert:
    - type: javascript
      value: >-
        output != null &&
        (typeof output === 'string' ? output.length > 0 : Object.keys(output).length > 0)
tests: langfuse://traces?tags=production&limit=50
```

Each trace becomes a test case. The response provider is not called, including when a trace has no output; missing outputs are graded as an empty string. Explicit provider and test transforms still apply. Model-graded assertions still call their configured grading provider. Results are stored locally and are not written back to Langfuse. An empty trace selection stops with an error before evaluation.

Exports created with `PROMPTFOO_STRIP_RESPONSE_OUTPUT=true` cannot replay stored responses. Restore `providerOutput` from the original source before replaying those tests.

Trace input and output may contain production data. They appear in local results and exports. Model-graded assertions can send that data to the grading provider, and sharing an eval also shares its stored trace data.

### Trace filters

| Parameter                      | Meaning                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| `limit`                        | Maximum number of traces; defaults to 100 and is capped at 1,000 |
| `tags`                         | Comma-separated or repeated tags; traces must include all tags   |
| `userId`, `sessionId`, `name`  | Match the corresponding trace field                              |
| `fromTimestamp`, `toTimestamp` | ISO 8601 timestamp bounds                                        |
| `version`, `release`           | Match the trace version or release                               |

Langfuse Cloud and SDK v6 use the Observations v2 API. Promptfoo imports one root observation per trace. Latency and cost describe that observation, and metadata may be truncated by the API. The `release` selector requires a self-hosted server with the legacy trace API and SDK v5.

Unknown or empty selectors and repeated scalar selectors are rejected. A `sessionId` filter selects individual traces. Each trace has independent conversation state.

### Trace variables

Imported variables and values returned by `transformVars` stay literal, including templates, file paths and schema references. To replay saved tests, import whole rows with their `metadata.__promptfoo` labels intact. A reference to just a field inside an external row loses that context and can be evaluated as local configuration.

Local variables still support templates and file loading. If an imported string variable is named `$ref`, the schema parser skips the entire `vars` mapping, including local references in it.

`input` contains the extracted trace input. The extracted response is stored in `providerOutput` and passed to assertions as `output`. Stored OpenAI tool calls retain the structure needed by `is-valid-openai-tools-call`. Mixed text and tool-call outputs retain their content. The original input is also available:

| Variable                                                         | Value                                              |
| ---------------------------------------------------------------- | -------------------------------------------------- |
| `__langfuse_input`                                               | Original input                                     |
| `__langfuse_trace_id`, `__langfuse_timestamp`                    | Trace ID and timestamp                             |
| `__langfuse_name`, `__langfuse_user_id`, `__langfuse_session_id` | Optional trace identifiers                         |
| `__langfuse_tags`, `__langfuse_metadata`                         | Tags and metadata                                  |
| `__langfuse_latency`, `__langfuse_cost`                          | Latency in seconds and cost in USD, when available |
| `__langfuse_url`                                                 | Trace link, when supplied by Langfuse              |

Local `defaultTest.vars` entries still render normally. After a step uses imported data, values saved with `storeOutputAs` stay literal for the rest of the run, including paths to local media files. To evaluate a new prompt or response provider against historical inputs, create ordinary test cases instead of using this stored-output source.
