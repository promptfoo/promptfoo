# bedrock-converse (AWS Bedrock Converse API)

You can run this example with:

```bash
npx promptfoo@latest init --example bedrock-converse
```

## Overview

This example demonstrates how to use AWS Bedrock's **Converse API**, which provides a unified interface across all Bedrock models with enhanced capabilities like streaming, tool use, and better guardrails integration.

### Converse API vs invokeModel

The Converse API (`bedrock-converse:`) is the newer, recommended approach compared to the traditional `bedrock:` provider:

| Feature                    | Converse API (`bedrock-converse:`) | invokeModel (`bedrock:`) |
| -------------------------- | ---------------------------------- | ------------------------ |
| Unified API                | ✅ Same interface for all models   | ❌ Model-specific formats |
| Native Prompt Management   | ✅ Supports bedrock:// URLs        | ✅ Supported             |
| Streaming                  | ✅ Built-in streaming support      | ⚠️ Model-dependent        |
| Tool Use                   | ✅ Function calling support        | ⚠️ Model-dependent        |
| Guardrails Integration     | ✅ Enhanced integration            | ⚠️ Basic support          |
| Multi-modal Support        | ✅ Images, documents               | ⚠️ Model-dependent        |

## Prerequisites

1. **AWS Credentials**: Set up your AWS credentials:

   ```bash
   export AWS_ACCESS_KEY_ID="your_access_key"
   export AWS_SECRET_ACCESS_KEY="your_secret_key"
   export AWS_REGION="us-east-1"  # or AWS_BEDROCK_REGION
   ```

   See [Bedrock authentication docs](https://www.promptfoo.dev/docs/providers/aws-bedrock/#authentication) for other methods (SSO, IAM roles, etc.).

2. **IAM Permissions**: Your AWS credentials need `bedrock:InvokeModel` permission:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["bedrock:InvokeModel"],
         "Resource": "arn:aws:bedrock:*::foundation-model/*"
       }
     ]
   }
   ```

   If using bedrock:// prompts, also add `bedrock:GetPrompt`:

   ```json
   {
     "Effect": "Allow",
     "Action": ["bedrock:GetPrompt"],
     "Resource": "arn:aws:bedrock:*:*:prompt/*"
   }
   ```

3. **Install Dependencies**:

   ```bash
   npm install @aws-sdk/client-bedrock-runtime
   ```

   For bedrock:// prompt support:

   ```bash
   npm install @aws-sdk/client-bedrock-agent
   ```

## Usage

### Basic Configuration

```yaml
providers:
  - id: bedrock-converse:us.anthropic.claude-3-5-sonnet-20241022-v2:0
    config:
      region: us-east-1
      temperature: 0.7
      max_tokens: 500
```

### Supported Models

The Converse API works with all Bedrock foundation models:

- **Anthropic**: `us.anthropic.claude-3-5-sonnet-20241022-v2:0`, `anthropic.claude-3-opus-20240229-v1:0`
- **Amazon**: `amazon.titan-text-premier-v1:0`, `amazon.titan-text-express-v1`
- **AI21**: `ai21.jamba-1-5-large-v1:0`, `ai21.jamba-1-5-mini-v1:0`
- **Meta**: `meta.llama3-1-70b-instruct-v1:0`, `meta.llama3-1-8b-instruct-v1:0`
- **Cohere**: `cohere.command-r-plus-v1:0`, `cohere.command-r-v1:0`
- **Mistral**: `mistral.mistral-large-2407-v1:0`, `mistral.mixtral-8x7b-instruct-v0:1`

### Configuration Options

```yaml
providers:
  - id: bedrock-converse:MODEL_ID
    config:
      region: us-east-1 # AWS region
      temperature: 0.7 # 0.0 to 1.0
      max_tokens: 500 # Maximum tokens to generate
      top_p: 0.9 # Nucleus sampling
      stop_sequences: ['END'] # Stop generation sequences

      # Optional: Guardrails
      guardrailIdentifier: guardrail-id
      guardrailVersion: '1'
```

### Using bedrock:// Prompts

The Converse API supports AWS Bedrock Prompt Management:

```yaml
prompts:
  - bedrock://PROMPT_ID # Uses DRAFT version
  - bedrock://PROMPT_ID:1 # Uses version 1
  - bedrock://PROMPT_ID:DRAFT # Explicitly uses DRAFT

providers:
  - id: bedrock-converse:us.anthropic.claude-3-5-sonnet-20241022-v2:0

tests:
  - vars:
      genre: jazz
      number: 5
```

**How it works:**

1. Promptfoo fetches the prompt template from Bedrock
2. Variables are rendered using Nunjucks
3. The rendered prompt is sent via Converse API

### Chat Format

The Converse API supports multi-turn conversations:

```yaml
prompts:
  - |
    [
      {"role": "system", "content": "You are a helpful music expert."},
      {"role": "user", "content": "Recommend {{number}} {{genre}} songs."},
      {"role": "assistant", "content": "I'd be happy to help!"},
      {"role": "user", "content": "Make it a playlist with song titles only."}
    ]
```

## Benefits

- **Unified Interface**: Same API across all Bedrock models - no model-specific formatting
- **Future-Proof**: New Bedrock features ship to Converse API first
- **Better Streaming**: Native streaming support with consistent format
- **Tool Use**: Built-in function calling capabilities
- **Enhanced Guardrails**: Improved integration with Bedrock Guardrails
- **Multi-modal**: Support for images, documents, and other content types

## Running the Example

```bash
# With local build (for development)
npm run local -- eval -c examples/bedrock-converse/promptfooconfig.yaml

# With published version
npx promptfoo@latest eval
```

## Troubleshooting

**Error: Model not found**

- Verify the model ID is correct
- Check model availability in your region
- Some models require opt-in via AWS Console

**Error: AccessDeniedException**

- Verify AWS credentials have `bedrock:InvokeModel` permission
- Check model access is granted in Bedrock Console
- For bedrock:// prompts, ensure `bedrock:GetPrompt` permission

**Error: Region not supported**

- Not all models are available in all regions
- Try `us-east-1` or `us-west-2` for widest model support

**Error: Module not found**

- Run `npm install @aws-sdk/client-bedrock-runtime`

## Migration from bedrock: Provider

Migrating from the traditional `bedrock:` provider is straightforward:

```yaml
# Old (invokeModel)
providers:
  - id: bedrock:us.anthropic.claude-3-5-sonnet-20241022-v2:0
    config:
      region: us-east-1

# New (Converse API)
providers:
  - id: bedrock-converse:us.anthropic.claude-3-5-sonnet-20241022-v2:0
    config:
      region: us-east-1
```

Most configurations work identically, but check the [migration guide](https://www.promptfoo.dev/docs/providers/aws-bedrock-converse/) for model-specific differences.

## Related Documentation

- [Bedrock Converse API Docs](https://www.promptfoo.dev/docs/providers/aws-bedrock-converse/)
- [Bedrock Prompt Management](https://www.promptfoo.dev/docs/integrations/bedrock-prompt-management/)
- [AWS Bedrock Converse API](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html)
- [Bedrock Provider Docs](https://www.promptfoo.dev/docs/providers/aws-bedrock/)
