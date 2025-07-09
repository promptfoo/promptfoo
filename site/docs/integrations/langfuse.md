---
sidebar_label: Langfuse
---

# Langfuse integration

[Langfuse](https://langfuse.com) is an open-source LLM engineering platform that includes collaborative prompt management, tracing, and evaluation capabilities.

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

You can reference prompts by version or label:

```yaml
# By version number
langfuse://prompt-name:version:type

# By label (recommended for production use)
langfuse://prompt-name@label:type
```

Where:

- `prompt-name`: The name of your prompt in Langfuse
- `version`: Specific version number (e.g., `1`, `2`, `3`)
- `label`: Label assigned to a prompt version (e.g., `production`, `staging`, `latest`)
- `type`: Either `text` or `chat` (defaults to `text` if omitted)

### Examples

```yaml
prompts:
  # Text prompts
  - 'langfuse://my-prompt:3:text' # Version 3, text prompt
  - 'langfuse://my-prompt@production' # Production label, text prompt (default)
  - 'langfuse://my-prompt@latest:text' # Latest label, text prompt

  # Chat prompts
  - 'langfuse://chat-prompt:2:chat' # Version 2, chat prompt
  - 'langfuse://chat-prompt@production:chat' # Production label, chat prompt
  - 'langfuse://chat-prompt@staging:chat' # Staging label, chat prompt

providers:
  - openai:gpt-4o-mini

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

- Prompt IDs containing `@` symbols are not fully supported due to parsing limitations. If your prompt name contains `@`, consider renaming it in Langfuse.
