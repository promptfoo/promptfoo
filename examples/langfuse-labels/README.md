# Langfuse Prompt Management with Labels

This example demonstrates how to use Langfuse prompt management with labels in promptfoo.

## Why use labels?

Labels allow you to:

- Deploy new prompt versions without changing your code
- Use different prompts for different environments (production, staging, development)
- A/B test different prompt versions
- Roll back to previous versions quickly

## Setup

1. **Install dependencies:**

   ```bash
   npm install langfuse
   ```

2. **Set environment variables:**

   ```bash
   export LANGFUSE_PUBLIC_KEY="your-public-key"
   export LANGFUSE_SECRET_KEY="your-secret-key"
   export LANGFUSE_HOST="https://cloud.langfuse.com"
   ```

3. **Create prompts in Langfuse:**
   - Log into your Langfuse dashboard
   - Create prompts named `customer-support` and `email-writer`
   - Add prompt templates with variables like `{{customer_name}}`, `{{issue}}`, etc.
   - Assign labels to your prompt versions (e.g., `production`, `staging`, `latest`)

## Running the example

```bash
npx promptfoo@latest eval
```

## Prompt format reference

```yaml
# By version number
langfuse://prompt-name:version:type

# By label (recommended)
langfuse://prompt-name@label:type
```

Where:

- `prompt-name`: The name of your prompt in Langfuse
- `version`: Specific version number (1, 2, 3, etc.)
- `label`: Label assigned to a prompt version
- `type`: Either `text` or `chat` (defaults to `text`)

## Example prompt references

```yaml
# Chat prompts with labels
langfuse://customer-support@production:chat
langfuse://customer-support@staging:chat

# Text prompts with labels
langfuse://email-writer@production
langfuse://email-writer@latest:text

# Version-based references
langfuse://customer-support:1:chat
langfuse://email-writer:3:text
```

## Best practices

1. **Use labels for production** - Avoid hardcoding version numbers
2. **Test in staging first** - Use a `staging` label to test changes
3. **Use descriptive labels** - `production`, `staging`, `experiment-a`, `tenant-xyz`
4. **Monitor performance** - Track metrics for different prompt versions
