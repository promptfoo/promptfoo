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

## Initialize this example

To get started with this example:

```bash
npx promptfoo@latest init --example langfuse-labels
```

## Running the example

```bash
npx promptfoo@latest eval
```

## Expected outputs

After running the eval, you should see:

- Comparison of responses from different labeled prompts (production vs staging)
- Performance metrics for each prompt version
- Test results showing how different providers handle the same prompts
- A detailed evaluation report demonstrating label-based prompt management

## Prompt format reference

### Two syntax options

Promptfoo supports two ways to reference Langfuse prompts with labels:

1. **Explicit @ syntax** (recommended for clarity)

   ```yaml
   langfuse://prompt-name@label:type
   ```

2. **Auto-detection with : syntax**

   ```yaml
   langfuse://prompt-name:version-or-label:type
   ```

   - Numeric values (e.g., `1`, `2`, `3`) are treated as versions
   - String values (e.g., `production`, `staging`) are treated as labels

### Format components

- `prompt-name`: The name of your prompt in Langfuse
- `version`: Specific version number (1, 2, 3, etc.)
- `label`: Label assigned to a prompt version
- `type`: Either `text` or `chat` (defaults to `text`)

## Example prompt references

```yaml
# Explicit @ syntax for labels (recommended)
langfuse://customer-support@production:chat
langfuse://customer-support@staging:chat
langfuse://email-writer@latest

# Auto-detection with : syntax
langfuse://customer-support:production:chat  # String → label
langfuse://customer-support:staging          # String → label
langfuse://email-writer:latest:text          # "latest" → label

# Version references (numeric values)
langfuse://customer-support:1:chat           # Numeric → version
langfuse://email-writer:3:text               # Numeric → version
```

## Best practices

1. **Use labels for production** - Avoid hardcoding version numbers
2. **Test in staging first** - Use a `staging` label to test changes
3. **Use descriptive labels** - `production`, `staging`, `experiment-a`, `tenant-xyz`
4. **Monitor performance** - Track metrics for different prompt versions
