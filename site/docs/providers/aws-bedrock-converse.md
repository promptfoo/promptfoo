---
title: AWS Bedrock Converse API
sidebar_label: Bedrock Converse API
sidebar_position: 4
description: Use AWS Bedrock Converse API for unified model access with streaming, tool use, and enhanced features
---

# Bedrock Converse API

The `bedrock-converse` provider uses AWS Bedrock's [Converse API](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html), which provides a unified interface across all Bedrock foundation models with enhanced capabilities.

## Converse API vs invokeModel

The Converse API is AWS's newer, recommended approach for Bedrock inference:

| Feature | Converse API (`bedrock-converse:`) | invokeModel (`bedrock:`) |
| --- | --- | --- |
| **Unified API** | ✅ Same interface for all models | ❌ Model-specific formats |
| **Streaming** | ✅ Built-in streaming support | ⚠️ Model-dependent |
| **Tool Use** | ✅ Function calling support | ⚠️ Model-dependent |
| **Guardrails** | ✅ Enhanced integration | ⚠️ Basic support |
| **Multi-modal** | ✅ Images, documents | ⚠️ Model-dependent |
| **Prompt Management** | ✅ Native bedrock:// support | ✅ Supported |

**When to use Converse API:**

- New projects (future-proof)
- Need streaming or tool use
- Want consistent API across models
- Using Bedrock Guardrails

**When to use invokeModel:**

- Existing projects with model-specific code
- Need model-specific features not in Converse
- Using older models not yet in Converse

## Setup

1. **Model Access**: Same as standard Bedrock - see [Bedrock setup](/docs/providers/aws-bedrock#setup)

2. Install the `@aws-sdk/client-bedrock-runtime` package:

   ```sh
   npm install @aws-sdk/client-bedrock-runtime
   ```

3. Configure AWS credentials (same as Bedrock):

   - IAM roles on EC2
   - `~/.aws/credentials`
   - `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` environment variables

4. Use the `bedrock-converse:` provider prefix:

   ```yaml
   providers:
     - id: bedrock-converse:us.anthropic.claude-3-5-sonnet-20241022-v2:0
   ```

## Basic Usage

```yaml
providers:
  - id: bedrock-converse:us.anthropic.claude-3-5-sonnet-20241022-v2:0
    config:
      region: us-east-1
      temperature: 0.7
      max_tokens: 500
```

## Supported Models

The Converse API works with all Bedrock foundation models:

- **Anthropic**: `us.anthropic.claude-3-5-sonnet-20241022-v2:0`, `anthropic.claude-3-opus-20240229-v1:0`, `us.anthropic.claude-sonnet-4-5-20250929-v1:0`
- **Amazon**: `amazon.titan-text-premier-v1:0`, `amazon.titan-text-express-v1`, `amazon.nova-lite-v1:0`, `amazon.nova-pro-v1:0`
- **AI21**: `ai21.jamba-1-5-large-v1:0`, `ai21.jamba-1-5-mini-v1:0`
- **Meta**: `meta.llama3-1-70b-instruct-v1:0`, `meta.llama3-1-8b-instruct-v1:0`, `meta.llama4-scout-17b-instruct-v1:0`
- **Cohere**: `cohere.command-r-plus-v1:0`, `cohere.command-r-v1:0`
- **Mistral**: `mistral.mistral-large-2407-v1:0`, `mistral.mixtral-8x7b-instruct-v0:1`

See [AWS Bedrock model IDs](https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html) for the complete list.

## Configuration Options

```yaml
providers:
  - id: bedrock-converse:MODEL_ID
    config:
      # AWS Configuration
      region: us-east-1
      accessKeyId: YOUR_ACCESS_KEY_ID # Optional
      secretAccessKey: YOUR_SECRET_ACCESS_KEY # Optional

      # Inference Parameters
      temperature: 0.7 # 0.0 to 1.0
      max_tokens: 500 # Maximum tokens to generate
      top_p: 0.9 # Nucleus sampling (0.0 to 1.0)
      stop_sequences: ['END', 'STOP'] # Stop generation sequences

      # Guardrails (optional)
      guardrailIdentifier: guardrail-abc123
      guardrailVersion: '1' # Or 'DRAFT'
```

## Using bedrock:// Prompts

The Converse API natively supports [Bedrock Prompt Management](/docs/integrations/bedrock-prompt-management):

```yaml
prompts:
  - bedrock://PROMPT_ID # Uses DRAFT version
  - bedrock://PROMPT_ID:1 # Uses version 1
  - bedrock://PROMPT_ID:DRAFT # Explicitly uses DRAFT

providers:
  - id: bedrock-converse:us.anthropic.claude-3-5-sonnet-20241022-v2:0
    config:
      region: us-east-1

tests:
  - vars:
      genre: jazz
      number: 5
    assert:
      - type: llm-rubric
        value: Response contains a list of 5 jazz songs
```

**How it works:**

1. Promptfoo fetches the prompt template from Bedrock Prompt Management
2. Variables are rendered using Nunjucks templating
3. The rendered prompt is sent to the model via Converse API

**Required permissions:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel"],
      "Resource": "arn:aws:bedrock:*::foundation-model/*"
    },
    {
      "Effect": "Allow",
      "Action": ["bedrock:GetPrompt"],
      "Resource": "arn:aws:bedrock:*:*:prompt/*"
    }
  ]
}
```

## Chat Format

The Converse API supports multi-turn conversations using JSON chat format:

```yaml
prompts:
  - |
    [
      {"role": "system", "content": "You are a helpful music expert."},
      {"role": "user", "content": "Recommend {{number}} {{genre}} songs."},
      {"role": "assistant", "content": "I'd be happy to help!"},
      {"role": "user", "content": "Make it a playlist with song titles only."}
    ]

providers:
  - id: bedrock-converse:us.anthropic.claude-3-5-sonnet-20241022-v2:0
```

**System messages** are automatically extracted and sent in the Converse API's `system` parameter.

## Guardrails Integration

The Converse API provides enhanced Bedrock Guardrails integration:

```yaml
providers:
  - id: bedrock-converse:us.anthropic.claude-3-5-sonnet-20241022-v2:0
    config:
      region: us-east-1
      guardrailIdentifier: abc123xyz
      guardrailVersion: '1' # Or 'DRAFT' for development
```

Guardrails are applied before and after model invocation, filtering harmful content based on your policies.

## Tool Use / Function Calling

The Converse API provides unified tool use (function calling) support across all compatible models:

```yaml
providers:
  - id: bedrock-converse:us.anthropic.claude-3-5-sonnet-20241022-v2:0
    config:
      region: us-east-1
      max_tokens: 1024
      tools:
        - toolSpec:
            name: get_weather
            description: Get the current weather for a location
            inputSchema:
              json:
                type: object
                properties:
                  location:
                    type: string
                    description: The city and state, e.g. San Francisco, CA
                  unit:
                    type: string
                    enum: [celsius, fahrenheit]
                    description: Temperature unit
                required: [location]
      tool_choice:
        auto: {}  # Let model decide when to use tools
```

**Alternative toolConfig format:**

```yaml
config:
  toolConfig:
    tools:
      - toolSpec:
          name: calculator
          description: Perform basic arithmetic
          inputSchema:
            json:
              type: object
              properties:
                expression:
                  type: string
              required: [expression]
    toolChoice:
      tool:
        name: calculator  # Force specific tool
```

**Supported models:**

- Claude (all versions)
- Amazon Nova
- Other models with tool use capability

**Response handling:**

Tool use responses include metadata with tool call details:

```typescript
{
  output: "I'll check the weather for you.\n[Tool Use: get_weather]",
  metadata: {
    stopReason: "tool_use",
    toolCalls: [
      {
        toolUseId: "...",
        name: "get_weather",
        input: { location: "San Francisco, CA", unit: "fahrenheit" }
      }
    ]
  }
}
```

## Model-Specific Parameters

:::warning Experimental Feature

Model-specific parameters via `additionalModelRequestFields` are currently experimental. AWS Bedrock Converse API may have limitations on which fields are supported. Some configurations may result in validation errors.

:::

The Converse API supports model-specific parameters via `additionalModelRequestFields`:

### Claude Extended Thinking

```yaml
providers:
  - id: bedrock-converse:us.anthropic.claude-3-5-sonnet-20241022-v2:0
    config:
      max_tokens: 20000
      thinking:
        type: enabled
        budget_tokens: 16000  # Must be ≥1024 and < max_tokens
      showThinking: true  # Include thinking in output (default: true)
```

**showThinking parameter:**

- `true` (default): Thinking content included in output
- `false`: Thinking content excluded from output

Useful when you want model reasoning without exposing it to end users.

### OpenAI Reasoning Effort

```yaml
providers:
  - id: bedrock-converse:openai.gpt-oss-120b-1:0
    config:
      region: us-west-2
      max_tokens: 2048
      reasoning_effort: high  # Options: low, medium, high
```

**Reasoning effort levels:**

- `low`: Faster responses with basic reasoning
- `medium`: Balanced performance and reasoning depth
- `high`: Thorough reasoning, slower but more accurate

### Qwen/DeepSeek Thinking

```yaml
providers:
  - id: bedrock-converse:qwen.qwen3-coder-480b-a35b-v1:0
    config:
      max_tokens: 2048
      showThinking: true  # Control thinking visibility
```

### Custom Model Fields

Pass any model-specific fields via `additionalModelRequestFields`:

```yaml
config:
  additionalModelRequestFields:
    customParameter: value
    anotherField: 123
```

## Multimodal Support

The Converse API supports multimodal content including images and documents:

### Image Input (Nova, Claude)

```yaml
prompts:
  - |
    [
      {
        "role": "user",
        "content": [
          {
            "image": {
              "format": "jpeg",
              "source": { "bytes": "{{image}}" }
            }
          },
          {
            "text": "What's in this image?"
          }
        ]
      }
    ]

providers:
  - id: bedrock-converse:amazon.nova-pro-v1:0
    config:
      region: us-east-1
      max_tokens: 1024

tests:
  - vars:
      image: file://path/to/image.jpg  # Auto-converted to base64
```

**Supported image formats:** JPEG, PNG, GIF, WebP

### Document Input

```yaml
prompts:
  - |
    [
      {
        "role": "user",
        "content": [
          {
            "document": {
              "format": "pdf",
              "name": "report.pdf",
              "source": { "bytes": "{{document}}" }
            }
          },
          {
            "text": "Summarize this document"
          }
        ]
      }
    ]

tests:
  - vars:
      document: file://path/to/report.pdf
```

**Supported document formats:** PDF, CSV, DOC, DOCX, XLS, XLSX, HTML, TXT, MD

### Multiple Content Blocks

Combine text, images, and documents in a single message:

```yaml
prompts:
  - |
    [
      {
        "role": "user",
        "content": [
          { "text": "Compare these two images:" },
          { "image": { "format": "jpeg", "source": { "bytes": "{{image1}}" } } },
          { "image": { "format": "jpeg", "source": { "bytes": "{{image2}}" } } },
          { "text": "What are the main differences?" }
        ]
      }
    ]
```

## Migration from bedrock: Provider

Migrating from `bedrock:` to `bedrock-converse:` is straightforward:

```yaml
# Before (invokeModel)
providers:
  - id: bedrock:us.anthropic.claude-3-5-sonnet-20241022-v2:0
    config:
      region: us-east-1
      temperature: 0.7

# After (Converse API)
providers:
  - id: bedrock-converse:us.anthropic.claude-3-5-sonnet-20241022-v2:0
    config:
      region: us-east-1
      temperature: 0.7
```

Most configuration options work identically. Key differences:

- Unified message format across all models
- System messages in separate `system` parameter
- Consistent token usage reporting
- Enhanced guardrails support

## Examples

### Basic Text Generation

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - 'Write a haiku about {{topic}}'

providers:
  - bedrock-converse:us.anthropic.claude-3-5-sonnet-20241022-v2:0

tests:
  - vars:
      topic: programming
  - vars:
      topic: nature
```

### Using Bedrock Prompts

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - bedrock://V2RPG4OT1K # Your Bedrock prompt ID

providers:
  - bedrock-converse:us.anthropic.claude-3-5-sonnet-20241022-v2:0
  - bedrock-converse:amazon.titan-text-premier-v1:0

tests:
  - vars:
      genre: jazz
      number: 5
```

### Multi-turn Conversation

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - |
    [
      {"role": "system", "content": "You are a helpful coding assistant."},
      {"role": "user", "content": "What's a {{language}} function?"},
      {"role": "assistant", "content": "A {{language}} function is a reusable block of code."},
      {"role": "user", "content": "Show me an example."}
    ]

providers:
  - bedrock-converse:us.anthropic.claude-3-5-sonnet-20241022-v2:0

tests:
  - vars:
      language: Python
  - vars:
      language: JavaScript
```

## Application Inference Profiles

The Converse API works seamlessly with Application Inference Profiles. Simply use the inference profile ARN as the model ID:

```yaml
providers:
  # Using inference profile ARN directly
  - id: bedrock-converse:arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/my-claude-profile
    config:
      region: us-east-1
      temperature: 0.7
      max_tokens: 1024
```

**Benefits of inference profiles with Converse:**

- **Automatic failover**: Routes to available regions if one is unavailable
- **Cost optimization**: Routes to most cost-effective model instance
- **Unified configuration**: Same settings across multiple model instances
- **No special configuration needed**: Unlike `bedrock:` provider, no `inferenceModelType` required

The Converse API automatically determines the model family from the profile configuration.

## Troubleshooting

**Error: Model not found**

- Verify the model ID is correct
- Check model availability in your region (try `us-east-1` or `us-west-2`)
- Some models require opt-in via AWS Console

**Error: AccessDeniedException**

- Verify AWS credentials have `bedrock:InvokeModel` permission
- Check model access is granted in Bedrock Console
- For bedrock:// prompts, ensure `bedrock:GetPrompt` permission

**Error: Region not supported**

- Not all models are available in all regions
- Use `us-east-1` or `us-west-2` for widest model support
- Check [model availability by region](https://docs.aws.amazon.com/bedrock/latest/userguide/models-regions.html)

**Slow response times**

- Some models have cold start latency on first invocation
- Consider using Application Inference Profiles for better routing
- Check if your account has provisioned throughput

## Related Resources

- [Bedrock Prompt Management](/docs/integrations/bedrock-prompt-management/)
- [Standard Bedrock Provider](/docs/providers/aws-bedrock/)
- [Bedrock Agents](/docs/providers/bedrock-agents/)
- [AWS Bedrock Converse API Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html)
