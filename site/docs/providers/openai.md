---
sidebar_position: 1
description: "Configure OpenAI's GPT models including GPT-4o, o1, GPT-3.5, embeddings, and assistants for comprehensive AI evaluations"
---

# OpenAI

To use the OpenAI API, set the `OPENAI_API_KEY` environment variable, specify via `apiKey` field in the configuration file or pass the API key as an argument to the constructor.

Example:

```sh
export OPENAI_API_KEY=your_api_key_here
```

The OpenAI provider supports the following model formats:

- `openai:chat:<model name>` - uses any model name against the `/v1/chat/completions` endpoint
- `openai:responses:<model name>` - uses responses API models over HTTP connections
- `openai:assistant:<assistant id>` - use an assistant
- `openai:<model name>` - uses a specific model name (mapped automatically to chat or completion endpoint)
- `openai:chat` - defaults to `gpt-5-mini`
- `openai:chat:ft:gpt-5-mini:company-name:ID` - example of a fine-tuned chat completion model
- `openai:completion` - defaults to `text-davinci-003`
- `openai:completion:<model name>` - uses any model name against the `/v1/completions` endpoint
- `openai:embeddings:<model name>` - uses any model name against the `/v1/embeddings` endpoint
- `openai:realtime:<model name>` - uses realtime API models over WebSocket connections
- `openai:video:<model name>` - uses Sora video generation models

The `openai:<endpoint>:<model name>` construction is useful if OpenAI releases a new model,
or if you have a custom model.
For example, if OpenAI releases `gpt-5` chat completion,
you could begin using it immediately with `openai:chat:gpt-5`.

```yaml title="GPT-5 only: verbosity and minimal reasoning"
providers:
  - id: openai:chat:gpt-5
    config:
      verbosity: high # low | medium | high
      reasoning_effort: minimal
  # For the Responses API, use a nested reasoning object:
  - id: openai:responses:gpt-5
    config:
      reasoning:
        effort: minimal
```

The OpenAI provider supports a handful of [configuration options](https://github.com/promptfoo/promptfoo/blob/main/src/providers/openai/types.ts#L112-L185), such as `temperature`, `functions`, and `tools`, which can be used to customize the behavior of the model like so:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:gpt-5-mini
    config:
      temperature: 0
      max_tokens: 1024
```

> **Note:** OpenAI models can also be accessed through [Azure OpenAI](/docs/providers/azure/), which offers additional enterprise features, compliance options, and regional availability.

## Formatting chat messages

For information on setting up chat conversation, see [chat threads](/docs/configuration/chat).

## Configuring parameters

The `providers` list takes a `config` key that allows you to set parameters like `temperature`, `max_tokens`, and [others](https://platform.openai.com/docs/api-reference/chat/create#chat/create-temperature). For example:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:gpt-5-mini
    config:
      temperature: 0
      max_tokens: 128
      apiKey: sk-abc123
```

Supported parameters include:

| Parameter               | Description                                                                                                                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiBaseUrl`            | The base URL of the OpenAI API, please also read `OPENAI_BASE_URL` below.                                                                                                                                                                                                                         |
| `apiHost`               | The hostname of the OpenAI API, please also read `OPENAI_API_HOST` below.                                                                                                                                                                                                                         |
| `apiKey`                | Your OpenAI API key, equivalent to `OPENAI_API_KEY` environment variable                                                                                                                                                                                                                          |
| `apiKeyEnvar`           | An environment variable that contains the API key                                                                                                                                                                                                                                                 |
| `best_of`               | Controls the number of alternative outputs to generate and select from.                                                                                                                                                                                                                           |
| `frequency_penalty`     | Applies a penalty to frequent tokens, making them less likely to appear in the output.                                                                                                                                                                                                            |
| `function_call`         | Controls whether the AI should call functions. Can be either 'none', 'auto', or an object with a `name` that specifies the function to call.                                                                                                                                                      |
| `functions`             | Allows you to define custom functions. Each function should be an object with a `name`, optional `description`, and `parameters`.                                                                                                                                                                 |
| `functionToolCallbacks` | A map of function tool names to function callbacks. Each callback should accept a string and return a string or a `Promise<string>`.                                                                                                                                                              |
| `headers`               | Additional headers to include in the request.                                                                                                                                                                                                                                                     |
| `max_tokens`            | Controls the maximum length of the output in tokens. Not valid for reasoning models (o1, o3, o3-pro, o3-mini, o4-mini).                                                                                                                                                                           |
| `maxRetries`            | Maximum number of retry attempts for failed API requests. Defaults to 4. Set to 0 to disable retries.                                                                                                                                                                                             |
| `metadata`              | Key-value pairs for request tagging and organization.                                                                                                                                                                                                                                             |
| `organization`          | Your OpenAI organization key.                                                                                                                                                                                                                                                                     |
| `passthrough`           | A flexible object that allows passing arbitrary parameters directly to the OpenAI API request body. Useful for experimental, new, or provider-specific parameters not yet explicitly supported in promptfoo. This parameter is merged into the final API request and can override other settings. |
| `presence_penalty`      | Applies a penalty to new tokens (tokens that haven't appeared in the input), making them less likely to appear in the output.                                                                                                                                                                     |
| `reasoning`             | Enhanced reasoning configuration for o-series models. Object with `effort` ('low', 'medium', 'high') and optional `summary` ('auto', 'concise', 'detailed') fields.                                                                                                                               |
| `response_format`       | Specifies the desired output format, including `json_object` and `json_schema`. Can also be specified in the prompt config. If specified in both, the prompt config takes precedence.                                                                                                             |
| `seed`                  | Seed used for deterministic output.                                                                                                                                                                                                                                                               |
| `stop`                  | Defines a list of tokens that signal the end of the output.                                                                                                                                                                                                                                       |
| `store`                 | Whether to store the conversation for future retrieval (boolean).                                                                                                                                                                                                                                 |
| `temperature`           | Controls the randomness of the AI's output. Higher values (close to 1) make the output more random, while lower values (close to 0) make it more deterministic.                                                                                                                                   |
| `tool_choice`           | Controls whether the AI should use a tool. See [OpenAI Tools documentation](https://platform.openai.com/docs/api-reference/chat/create#chat-create-tools)                                                                                                                                         |
| `tools`                 | Allows you to define custom tools. See [OpenAI Tools documentation](https://platform.openai.com/docs/api-reference/chat/create#chat-create-tools)                                                                                                                                                 |
| `top_p`                 | Controls the nucleus sampling, a method that helps control the randomness of the AI's output.                                                                                                                                                                                                     |
| `user`                  | A unique identifier representing your end-user, for tracking and abuse prevention.                                                                                                                                                                                                                |
| `max_completion_tokens` | Maximum number of tokens to generate for reasoning models (o1, o3, o3-pro, o3-mini, o4-mini).                                                                                                                                                                                                     |

Here are the type declarations of `config` parameters:

```typescript
interface OpenAiConfig {
  // Completion parameters
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  reasoning?: {
    effort?: 'low' | 'medium' | 'high' | null;
    summary?: 'auto' | 'concise' | 'detailed' | null;
  };
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  best_of?: number;
  functions?: OpenAiFunction[];
  function_call?: 'none' | 'auto' | { name: string };
  tools?: OpenAiTool[];
  tool_choice?: 'none' | 'auto' | 'required' | { type: 'function'; function?: { name: string } };
  response_format?: { type: 'json_object' | 'json_schema'; json_schema?: object };
  stop?: string[];
  seed?: number;
  user?: string;
  metadata?: Record<string, string>;
  store?: boolean;
  passthrough?: object;

  // Function tool callbacks
  functionToolCallbacks?: Record<
    OpenAI.FunctionDefinition['name'],
    (arg: string) => Promise<string>
  >;

  // General OpenAI parameters
  apiKey?: string;
  apiKeyEnvar?: string;
  apiHost?: string;
  apiBaseUrl?: string;
  organization?: string;
  headers?: { [key: string]: string };
  maxRetries?: number;
}
```

## Models

### GPT-4.1

GPT-4.1 is OpenAI's flagship model for complex tasks with a 1,047,576 token context window and 32,768 max output tokens. Available in three variants with different price points:

| Model        | Description                                  | Input Price         | Output Price        |
| ------------ | -------------------------------------------- | ------------------- | ------------------- |
| GPT-4.1      | Flagship model for complex tasks             | $2.00 per 1M tokens | $8.00 per 1M tokens |
| GPT-4.1 Mini | More affordable, strong general capabilities | $0.40 per 1M tokens | $1.60 per 1M tokens |
| GPT-4.1 Nano | Most economical, good for high-volume tasks  | $0.10 per 1M tokens | $0.40 per 1M tokens |

All variants support text and image input with text output and have a May 31, 2024 knowledge cutoff.

#### Usage Examples

Standard model:

```yaml
providers:
  - id: openai:chat:gpt-5 # or openai:responses:gpt-5
    config:
      temperature: 0.7
```

More affordable variants:

```yaml
providers:
  - id: openai:chat:gpt-5-mini # or -nano variant
```

Specific snapshot versions are also available:

```yaml
providers:
  - id: openai:chat:gpt-5-2025-08-07 # Standard
  - id: openai:chat:gpt-5-mini-2025-08-07 # Mini
  - id: openai:chat:gpt-5-nano-2025-08-07 # Nano
```

### GPT-5.1

GPT-5.1 is OpenAI's newest flagship model, part of the GPT-5 model family. It excels at coding and agentic tasks with improved steerability, a new `none` reasoning mode for faster responses, and new tools for coding use cases.

#### Available Models

| Model               | Description                                        | Best For                                    |
| ------------------- | -------------------------------------------------- | ------------------------------------------- |
| gpt-5.1             | Latest flagship model                              | Complex reasoning and broad world knowledge |
| gpt-5.1-2025-11-13  | Dated snapshot version                             | Locked behavior for production              |
| gpt-5.1-mini        | Cost-optimized reasoning                           | Balanced speed, cost, and capability        |
| gpt-5.1-nano        | High-throughput model                              | Simple instruction-following tasks          |
| gpt-5.1-codex       | Specialized for coding tasks in Codex environments | Agentic coding workflows                    |
| gpt-5.1-codex-max   | Frontier agentic coding model with compaction      | Long-running coding tasks and refactors     |
| gpt-5.1-chat-latest | Chat-optimized alias                               | Conversational applications                 |

#### Key Features

GPT-5.1 introduces several improvements over GPT-5:

- **`none` reasoning mode**: New lowest reasoning setting for low-latency interactions (default setting)
- **Increased steerability**: Better control over personality, tone, and output format
- **Configurable verbosity**: Control output length with `low`, `medium`, or `high` settings (default: `medium`)

#### Usage Examples

Fast, low-latency responses:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:responses:gpt-5.1
    config:
      reasoning:
        effort: 'none' # Default setting - no reasoning tokens
      verbosity: 'low' # Concise outputs
```

Complex coding and reasoning tasks:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:responses:gpt-5.1
    config:
      reasoning:
        effort: 'high' # Maximum reasoning for complex tasks
      verbosity: 'medium' # Balanced output length
      max_output_tokens: 4096
```

#### Reasoning Modes

GPT-5.1 supports four reasoning effort levels:

- **`none`** (default): No reasoning tokens, fastest responses, similar to non-reasoning models
- **`low`**: Minimal reasoning for straightforward tasks
- **`medium`**: Balanced reasoning for moderate complexity
- **`high`**: Maximum reasoning for complex problem-solving

#### Migration from GPT-5

GPT-5.1 with default settings (`none` reasoning) is designed as a drop-in replacement for GPT-5. Key differences:

- GPT-5.1 defaults to `none` reasoning effort (GPT-5 defaulted to `low`)
- GPT-5.1 has better-calibrated reasoning token consumption
- Improved instruction-following and output formatting

For tasks requiring reasoning, start with `medium` effort and increase to `high` if needed.

### GPT-5.1-Codex-Max

GPT-5.1-Codex-Max is OpenAI's frontier agentic coding model, built on an updated foundational reasoning model trained on agentic tasks across software engineering, math, research, and more. It's designed for long-running, detailed coding work.

#### Key Capabilities

- **Compaction**: First model natively trained to operate across multiple context windows through compaction, coherently working over millions of tokens in a single task
- **Long-running tasks**: Supports project-scale refactors, deep debugging sessions, and multi-hour agent loops
- **Token efficiency**: 30% fewer thinking tokens compared to GPT-5.1-Codex at the same reasoning effort level
- **Windows support**: First model trained to operate in Windows environments
- **Improved collaboration**: Better performance as a coding partner in CLI environments

#### Usage Examples

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:responses:gpt-5.1-codex-max
    config:
      reasoning:
        effort: 'medium' # Recommended for most tasks
      max_output_tokens: 25000 # Reserve space for reasoning and outputs
```

For latency-insensitive tasks requiring maximum quality:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:responses:gpt-5.1-codex-max
    config:
      reasoning:
        effort: 'xhigh' # Extra high reasoning for best results
      max_output_tokens: 40000
```

:::warning
GPT-5.1-Codex-Max is only available through the Responses API (`openai:responses:`). It does not work with the Chat Completions API (`openai:chat:`).
:::

#### Reasoning Effort Levels

- **`low`**: Minimal reasoning for straightforward tasks
- **`medium`**: Balanced reasoning, recommended as daily driver
- **`high`**: Maximum reasoning for complex problem-solving
- **`xhigh`**: Extra high reasoning for non-latency-sensitive tasks requiring best results

#### Best Practices

- Use for agentic coding tasks in Codex or Codex-like environments
- Reserve at least 25,000 tokens for reasoning and outputs when starting
- Start with `medium` reasoning effort for most tasks
- Use `xhigh` effort only for complex tasks where latency is not a concern
- Review agent work before deploying to production

:::note
GPT-5.1-Codex-Max is recommended for use only in agentic coding environments and is not a general-purpose model like GPT-5.1.
:::

### GPT-5.2

GPT-5.2 is OpenAI's flagship model for coding and agentic tasks. It offers significant improvements in safety, instruction following, and reduced deception compared to GPT-5.1.

#### Available Models

| Model              | Description                           | Best For                           |
| ------------------ | ------------------------------------- | ---------------------------------- |
| gpt-5.2            | Flagship model for coding and agentic | Complex reasoning and coding tasks |
| gpt-5.2-2025-12-11 | Snapshot version                      | Locked behavior for production     |

#### Key Specifications

- **Context window**: 400,000 tokens
- **Max output tokens**: 128,000 tokens
- **Reasoning support**: Full reasoning token support with configurable effort levels
- **Pricing**: $1.75 per 1M input tokens, $14 per 1M output tokens

#### Usage Examples

GPT-5.2 is available via both the Chat Completions API and Responses API:

**Chat Completions API:**

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:chat:gpt-5.2
    config:
      max_completion_tokens: 4096

  # With reasoning effort
  - id: openai:chat:gpt-5.2
    config:
      reasoning_effort: 'medium'
      max_completion_tokens: 4096
```

**Responses API:**

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:responses:gpt-5.2
    config:
      max_output_tokens: 4096

  # With reasoning effort (nested format)
  - id: openai:responses:gpt-5.2
    config:
      reasoning:
        effort: 'medium'
      max_output_tokens: 4096
```

Fast, low-latency responses (no reasoning):

```yaml title="promptfooconfig.yaml"
providers:
  # Chat API
  - id: openai:chat:gpt-5.2
    config:
      reasoning_effort: 'none'
      max_completion_tokens: 2048

  # Responses API
  - id: openai:responses:gpt-5.2
    config:
      reasoning:
        effort: 'none'
      max_output_tokens: 2048
```

#### Key Improvements over GPT-5.1

- **Reduced deception**: Significantly lower deception rates in production traffic
- **Better safety compliance**: Improved cyber safety policy compliance
- **Improved prompt injection resistance**: Enhanced robustness to known prompt injection attacks
- **Enhanced sensitive topic handling**: Better performance on mental health and emotional reliance evaluations

#### Reasoning Effort Levels

- **`none`**: No reasoning tokens, fastest responses
- **`low`**: Minimal reasoning for straightforward tasks
- **`medium`**: Balanced reasoning for moderate complexity
- **`high`**: Maximum reasoning for complex problem-solving

### Reasoning Models (o1, o3, o3-pro, o3-mini, o4-mini)

Reasoning models, like `o1`, `o3`, `o3-pro`, `o3-mini`, and `o4-mini`, are large language models trained with reinforcement learning to perform complex reasoning. These models excel in complex problem-solving, coding, scientific reasoning, and multi-step planning for agentic workflows.

When using reasoning models, there are important differences in how tokens are handled:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:o1
    config:
      reasoning:
        effort: 'medium' # Can be "low", "medium", or "high"
      max_completion_tokens: 25000 # Can also be set via OPENAI_MAX_COMPLETION_TOKENS env var
```

Unlike standard models that use `max_tokens`, reasoning models use:

- `max_completion_tokens` to control the total tokens generated (both reasoning and visible output)
- `reasoning` to control how thoroughly the model thinks before responding (with `effort`: none (GPT-5.1 only), low, medium, high)

#### How Reasoning Models Work

Reasoning models "think before they answer," generating internal reasoning tokens that:

- Are not visible in the output
- Count towards token usage and billing
- Occupy space in the context window

Both `o1` and `o3-mini` models have a 128,000 token context window, while `o3-pro` and `o4-mini` have a 200,000 token context window. OpenAI recommends reserving at least 25,000 tokens for reasoning and outputs when starting with these models.

## Images

### Sending images in prompts

You can include images in the prompt by using content blocks. For example, here's an example config:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - file://prompt.json

providers:
  - openai:gpt-5

tests:
  - vars:
      question: 'What do you see?'
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg'
  # ...
```

And an example `prompt.json`:

```json title="prompt.json"
[
  {
    "role": "user",
    "content": [
      {
        "type": "text",
        "text": "{{question}}"
      },
      {
        "type": "image_url",
        "image_url": {
          "url": "{{url}}"
        }
      }
    ]
  }
]
```

See the [OpenAI vision example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-vision).

### Generating images

OpenAI supports image generation via `openai:image:<model>`. Supported models include:

- `gpt-image-1.5` - OpenAI's state-of-the-art image generation model with best instruction following
- `gpt-image-1` - High-quality image generation model
- `gpt-image-1-mini` - Cost-efficient version of GPT Image 1
- `dall-e-3` - High quality image generation with larger resolution support
- `dall-e-2` - Lower cost option with concurrent requests support

See the [OpenAI image generation example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-images).

#### GPT Image 1.5

GPT Image 1.5 is OpenAI's most advanced image generation model with superior instruction following, prompt adherence, and photorealistic quality. It uses token-based pricing for more flexible cost control.

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:image:gpt-image-1.5
    config:
      size: 1024x1024 # 1024x1024, 1024x1536, 1536x1024, or auto
      quality: low # low, medium, high, or auto
      background: transparent # transparent, opaque, or auto
      output_format: png # png, jpeg, or webp
      output_compression: 80 # 0-100, only for jpeg/webp
      moderation: auto # auto or low
```

| Parameter            | Description                             | Options                                       |
| -------------------- | --------------------------------------- | --------------------------------------------- |
| `size`               | Image dimensions                        | `1024x1024`, `1024x1536`, `1536x1024`, `auto` |
| `quality`            | Rendering quality                       | `low`, `medium`, `high`, `auto`               |
| `background`         | Background transparency (png/webp only) | `transparent`, `opaque`, `auto`               |
| `output_format`      | Output image format                     | `png`, `jpeg`, `webp`                         |
| `output_compression` | Compression level (jpeg/webp only)      | `0-100`                                       |
| `moderation`         | Content moderation strictness           | `auto`, `low`                                 |

**Pricing:**

GPT Image 1.5 uses token-based pricing at $5/1M input text tokens, $10/1M output text tokens, $8/1M input image tokens, and $32/1M output image tokens. Estimated costs per image:

| Quality | 1024x1024 | 1024x1536 | 1536x1024 |
| ------- | --------- | --------- | --------- |
| Low     | ~$0.064   | ~$0.096   | ~$0.096   |
| Medium  | ~$0.128   | ~$0.192   | ~$0.192   |
| High    | ~$0.192   | ~$0.288   | ~$0.288   |

#### GPT Image 1

GPT Image 1 is a high-quality image generation model with superior instruction following, text rendering, and real-world knowledge.

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:image:gpt-image-1
    config:
      size: 1024x1024 # 1024x1024, 1024x1536, 1536x1024, or auto
      quality: low # low, medium, high, or auto
      background: transparent # transparent, opaque, or auto
      output_format: png # png, jpeg, or webp
      output_compression: 80 # 0-100, only for jpeg/webp
      moderation: auto # auto or low
```

| Parameter            | Description                             | Options                                       |
| -------------------- | --------------------------------------- | --------------------------------------------- |
| `size`               | Image dimensions                        | `1024x1024`, `1024x1536`, `1536x1024`, `auto` |
| `quality`            | Rendering quality                       | `low`, `medium`, `high`, `auto`               |
| `background`         | Background transparency (png/webp only) | `transparent`, `opaque`, `auto`               |
| `output_format`      | Output image format                     | `png`, `jpeg`, `webp`                         |
| `output_compression` | Compression level (jpeg/webp only)      | `0-100`                                       |
| `moderation`         | Content moderation strictness           | `auto`, `low`                                 |

**Pricing:**

| Quality | 1024x1024 | 1024x1536 | 1536x1024 |
| ------- | --------- | --------- | --------- |
| Low     | $0.011    | $0.016    | $0.016    |
| Medium  | $0.042    | $0.063    | $0.063    |
| High    | $0.167    | $0.25     | $0.25     |

#### GPT Image 1 Mini

GPT Image 1 Mini is a cost-efficient version of GPT Image 1 with the same capabilities at lower cost.

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:image:gpt-image-1-mini
    config:
      size: 1024x1024 # 1024x1024, 1024x1536, 1536x1024, or auto
      quality: low # low, medium, high, or auto
      background: transparent # transparent, opaque, or auto
      output_format: png # png, jpeg, or webp
      output_compression: 80 # 0-100, only for jpeg/webp
      moderation: auto # auto or low
```

**Pricing:**

| Quality | 1024x1024 | 1024x1536 | 1536x1024 |
| ------- | --------- | --------- | --------- |
| Low     | $0.005    | $0.006    | $0.006    |
| Medium  | $0.011    | $0.015    | $0.015    |
| High    | $0.036    | $0.052    | $0.052    |

#### DALL-E 3

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:image:dall-e-3
    config:
      size: 1024x1024 # 1024x1024, 1792x1024, 1024x1792
      quality: standard # standard or hd
      style: vivid # vivid or natural
```

#### DALL-E 2

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:image:dall-e-2
    config:
      size: 512x512 # 256x256, 512x512, 1024x1024
      response_format: url # url or b64_json
```

#### Example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - 'In the style of Van Gogh: {{subject}}'
  - 'In the style of Dali: {{subject}}'

providers:
  - openai:image:gpt-image-1.5

tests:
  - vars:
      subject: bananas
  - vars:
      subject: new york city
```

To display images in the web viewer, wrap vars or outputs in markdown image tags like so:

```markdown
![](/path/to/myimage.png)
```

Then, enable 'Render markdown' under Table Settings.

## Video Generation (Sora)

OpenAI supports video generation via `openai:video:<model>`. Supported models include:

- `sora-2` - OpenAI's video generation model ($0.10/second)
- `sora-2-pro` - Higher quality video generation ($0.30/second)

### Basic Usage

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:video:sora-2
    config:
      size: 1280x720 # 1280x720 (landscape) or 720x1280 (portrait)
      seconds: 8 # Duration: 4, 8, or 12 seconds
```

### Configuration Options

| Parameter              | Description                                       | Default    |
| ---------------------- | ------------------------------------------------- | ---------- |
| `size`                 | Video dimensions                                  | `1280x720` |
| `seconds`              | Duration in seconds (4, 8, or 12)                 | `8`        |
| `input_reference`      | Base64 image data or file path for image-to-video | -          |
| `remix_video_id`       | ID of a previous Sora video to remix              | -          |
| `poll_interval_ms`     | Polling interval for job status                   | `10000`    |
| `max_poll_time_ms`     | Maximum time to wait for video generation         | `600000`   |
| `download_thumbnail`   | Download thumbnail preview                        | `true`     |
| `download_spritesheet` | Download spritesheet preview                      | `true`     |

### Example Configuration

```yaml title="promptfooconfig.yaml"
prompts:
  - 'A cinematic shot of: {{scene}}'

providers:
  - id: openai:video:sora-2
    config:
      size: 1280x720
      seconds: 4
  - id: openai:video:sora-2-pro
    config:
      size: 720x1280
      seconds: 8

tests:
  - vars:
      scene: a cat riding a skateboard through a city
  - vars:
      scene: waves crashing on a beach at sunset
```

### Image-to-Video Generation

Generate videos starting from a source image using `input_reference`:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:video:sora-2
    config:
      input_reference: file://assets/start-image.png
      seconds: 4

prompts:
  - 'Animate this image: the character slowly walks forward'
```

The `input_reference` accepts either a `file://` path or base64-encoded image data.

### Video Remixing

Remix an existing Sora video with a new prompt using `remix_video_id`:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:video:sora-2
    config:
      remix_video_id: video_abc123def456

prompts:
  - 'Make the scene more dramatic with stormy weather'
```

The `remix_video_id` is the video ID returned from a previous Sora generation (found in `response.video.id`).

:::note
Remixed videos are not cached since each remix produces unique results even with the same prompt.
:::

### Viewing Generated Videos

Videos are automatically displayed in the web viewer with playback controls. The viewer shows:

- Video player with controls
- Video metadata (model, size, duration)
- Thumbnail preview (if enabled)

Videos are stored in promptfoo's media storage (`~/.promptfoo/media/`) and served via the web interface.

### Pricing

| Model      | Cost per Second |
| ---------- | --------------- |
| sora-2     | $0.10           |
| sora-2-pro | $0.30           |

## Web Search Support

The OpenAI Responses API supports web search capabilities through the `web_search_preview` tool, which enables the `search-rubric` assertion type. This allows models to search the web for current information and verify facts.

### Enabling Web Search

To enable web search with the OpenAI Responses API, use the `openai:responses` provider format and add the `web_search_preview` tool to your configuration:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:responses:gpt-5.1
    config:
      tools:
        - type: web_search_preview
```

### Using Web Search Assertions

The `search-rubric` assertion type uses web search to quickly verify current information:

- Real-time data (weather, stock prices, news)
- Current events and statistics
- Time-sensitive information
- Quick fact verification

Example configuration:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - 'What is the current temperature in {{city}}?'

providers:
  - id: openai:responses:gpt-5.1
    config:
      tools:
        - type: web_search_preview

tests:
  - vars:
      city: New York
    assert:
      - type: search-rubric
        value: Current temperature in New York City
```

### Cost Considerations

:::info
Web search calls in the Responses API are billed separately from normal tokens:

- The web search tool costs **$10 per 1,000 calls** for the standard tool and **$10-25 per 1,000 calls** for preview variants, plus any search content tokens where applicable
- Each search-rubric assertion may perform one or more searches
- Caching is enabled by default; use `--no-cache` to force fresh searches during development
- See [OpenAI's pricing page](https://openai.com/api/pricing/) for current rates
  :::

### Best Practices

1. **Use specific search queries**: More specific queries yield better verification results
2. **Use caching**: Caching is enabled by default; results are reused to avoid repeated searches
3. **Use appropriate models**: gpt-5.1-mini is recommended for cost-effective web search
4. **Monitor usage**: Track API costs, especially in CI/CD pipelines

For more details on using search-rubric assertions, see the [Search-Rubric documentation](/docs/configuration/expected-outputs/model-graded/search-rubric).

## Tool Calling

OpenAI tools and functions are supported. See [OpenAI tools example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-tools-call) and [OpenAI functions example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-function-call).

:::tip Portable Tool Definitions

For configs that work across multiple providers, use the [NormalizedTool format](/docs/configuration/tools):

```yaml
tools:
  - name: get_weather
    description: Get weather for a location
    parameters:
      type: object
      properties:
        location: { type: string }
```

:::

### Using tools

To set `tools` on an OpenAI provider, use the provider's `config` key. The model may return tool calls in two formats:

1. An array of tool calls: `[{type: 'function', function: {...}}]`
2. A message with tool calls: `{content: '...', tool_calls: [{type: 'function', function: {...}}]}`

Tools can be defined inline or loaded from an external file:

:::info Supported file formats

Tools can be loaded from external files in multiple formats:

```yaml
# Static data files
tools: file://./tools.yaml
tools: file://./tools.json

# Dynamic tool definitions from code (requires function name)
tools: file://./tools.py:get_tools
tools: file://./tools.js:getTools
tools: file://./tools.ts:getTools
```

Python and JavaScript files must export a function that returns the tool definitions array. The function can be synchronous or asynchronous.

**Asynchronous example:**

```javascript
// tools.js - Fetch tool definitions from API at runtime
export async function getTools() {
  const apiKey = process.env.INTERNAL_API_KEY;
  const response = await fetch('https://api.internal.com/tool-definitions', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const tools = await response.json();
  return tools;
}
```

:::

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - file://prompt.txt
providers:
  - id: openai:chat:gpt-5-mini
    // highlight-start
    config:
      # Load tools from external file
      tools: file://./weather_tools.yaml
      # Or define inline
      tools: [
        {
        "type": "function",
          "function": {
            "name": "get_current_weather",
            "description": "Get the current weather in a given location",
            "parameters": {
              "type": "object",
                "properties": {
                  "location": {
                    "type": "string",
                      "description": "The city and state, e.g. San Francisco, CA"
                    },
                    "unit": {
                      "type": "string",
                      "enum": ["celsius", "fahrenheit"]
                    }
                  },
              "required": ["location"]
            }
          }
        }
      ]
      tool_choice: 'auto'
    // highlight-end

tests:
   - vars:
        city: Boston
     assert:
        - type: is-json
        - type: is-valid-openai-tools-call
        - type: javascript
          value: output[0].function.name === 'get_current_weather'
        - type: javascript
          value: JSON.parse(output[0].function.arguments).location === 'Boston, MA'

   - vars:
        city: New York
# ...
```

Sometimes OpenAI function calls don't match `tools` schemas. Use [`is-valid-openai-tools-call`](/docs/configuration/expected-outputs/deterministic/#is-valid-openai-function-call) or [`is-valid-openai-tools-call`](/docs/configuration/expected-outputs/deterministic/#is-valid-openai-tools-call) assertions to enforce an exact schema match between tools and the function definition.

To further test `tools` definitions, you can use the `javascript` assertion and/or `transform` directives. For example:

```yaml title="promptfooconfig.yaml"
tests:
  - vars:
      city: Boston
    assert:
      - type: is-json
      - type: is-valid-openai-tools-call
      - type: javascript
        value: output[0].function.name === 'get_current_weather'
      - type: javascript
        value: JSON.parse(output[0].function.arguments).location === 'Boston, MA'

  - vars:
      city: New York
      # transform returns only the 'name' property
    transform: output[0].function.name
    assert:
      - type: is-json
      - type: similar
        value: NYC
```

:::tip
Functions can use variables from test cases:

```js
{
  type: "function",
  function: {
    description: "Get temperature in {{city}}"
    // ...
  }
}
```

They can also include functions that dynamically reference vars:

```js
{
  type: "function",
  function: {
    name: "get_temperature",
    parameters: {
      type: "object",
        properties: {
          unit: {
            type: "string",
            // highlight-start
            enum: (vars) => vars.units,
            // highlight-end
          }
        },
    }
  }
}
```

:::

### Using functions

> `functions` and `function_call` is deprecated in favor of `tools` and `tool_choice`, see detail in [OpenAI API reference](https://platform.openai.com/docs/api-reference/chat/create#chat-create-function_call).

Use the `functions` config to define custom functions. Each function should be an object with a `name`, optional `description`, and `parameters`. For example:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - file://prompt.txt
providers:
  - id: openai:chat:gpt-5-mini
    // highlight-start
    config:
      functions:
        [
          {
            'name': 'get_current_weather',
            'description': 'Get the current weather in a given location',
            'parameters':
              {
                'type': 'object',
                'properties':
                  {
                    'location':
                      {
                        'type': 'string',
                        'description': 'The city and state, e.g. San Francisco, CA',
                      },
                    'unit': { 'type': 'string', 'enum': ['celsius', 'fahrenheit'] },
                  },
                'required': ['location'],
              },
          },
        ]
    // highlight-end
tests:
  - vars:
      city: Boston
    assert:
      // highlight-next-line
      - type: is-valid-openai-function-call
  - vars:
      city: New York
  # ...
```

Sometimes OpenAI function calls don't match `functions` schemas. Use [`is-valid-openai-function-call`](/docs/configuration/expected-outputs/deterministic#is-valid-openai-function-call) assertions to enforce an exact schema match between function calls and the function definition.

To further test function call definitions, you can use the `javascript` assertion and/or `transform` directives. For example:

```yaml title="promptfooconfig.yaml"
tests:
  - vars:
      city: Boston
    assert:
      - type: is-valid-openai-function-call
      - type: javascript
        value: output.name === 'get_current_weather'
      - type: javascript
        value: JSON.parse(output.arguments).location === 'Boston, MA'

  - vars:
      city: New York
    # transform returns only the 'name' property for this test case
    transform: output.name
    assert:
      - type: is-json
      - type: similar
        value: NYC
```

### Loading tools/functions from a file

Instead of duplicating function definitions across multiple configurations, you can reference an external YAML (or JSON) file that contains your functions. This allows you to maintain a single source of truth for your functions, which is particularly useful if you have multiple versions or regular changes to definitions.

:::tip

Tool definitions can be loaded from JSON, YAML, Python, or JavaScript files. For Python/JS files, specify a function name that returns the tool definitions: `file://tools.py:get_tools`

:::

To load your functions from a file, specify the file path in your provider configuration like so:

```yaml title="promptfooconfig.yaml"
providers:
  - file://./path/to/provider_with_function.yaml
```

You can also use a pattern to load multiple files:

```yaml title="promptfooconfig.yaml"
providers:
  - file://./path/to/provider_*.yaml
```

Here's an example of how your `provider_with_function.yaml` might look:

```yaml title="provider_with_function.yaml"
id: openai:chat:gpt-5-mini
config:
  functions:
    - name: get_current_weather
      description: Get the current weather in a given location
      parameters:
        type: object
        properties:
          location:
            type: string
            description: The city and state, e.g. San Francisco, CA
          unit:
            type: string
            enum:
              - celsius
              - fahrenheit
            description: The unit in which to return the temperature
        required:
          - location
```

## Using `response_format`

Promptfoo supports the `response_format` parameter, which allows you to specify the expected output format.

`response_format` can be included in the provider config, or in the prompt config.

#### Prompt config example

```yaml title="promptfooconfig.yaml"
prompts:
  - label: 'Prompt #1'
    raw: 'You are a helpful math tutor. Solve {{problem}}'
    config:
      response_format:
        type: json_schema
        json_schema: ...
```

#### Provider config example

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:chat:gpt-5-mini
    config:
      response_format:
        type: json_schema
        json_schema: ...
```

#### External file references

To make it easier to manage large JSON schemas, external file references are supported for `response_format` in both Chat and Responses APIs. This is particularly useful for:

- Reusing complex JSON schemas across multiple configurations
- Managing large schemas in separate files for better organization
- Version controlling schemas independently from configuration files

```yaml
config:
  response_format: file://./path/to/response_format.json
```

The external file should contain the complete `response_format` configuration object:

```json title="response_format.json"
{
  "type": "json_schema",
  "name": "event_extraction",
  "schema": {
    "type": "object",
    "properties": {
      "event_name": { "type": "string" },
      "date": { "type": "string" },
      "location": { "type": "string" }
    },
    "required": ["event_name", "date", "location"],
    "additionalProperties": false
  }
}
```

You can also use nested file references for the schema itself, which is useful for sharing schemas across multiple response formats:

```json title="response_format.json"
{
  "type": "json_schema",
  "name": "event_extraction",
  "schema": "file://./schemas/event-schema.json"
}
```

Variable rendering is supported in file paths using Nunjucks syntax:

```yaml
config:
  response_format: file://./schemas/{{ schema_name }}.json
```

For a complete example with the Chat API, see the [OpenAI Structured Output example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-structured-output) or initialize it with:

```bash
npx promptfoo@latest init --example openai-structured-output
```

For an example with the Responses API, see the [OpenAI Responses API example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-responses) and run:

```bash
npx promptfoo@latest init --example openai-responses
cd openai-responses
npx promptfoo@latest eval -c promptfooconfig.external-format.yaml
```

#### Per-test structured output

You can use different JSON schemas for different test cases using the `test.options` field. This allows a single prompt to produce different structured output formats depending on the test:

```yaml title="promptfooconfig.yaml"
prompts:
  - 'Answer this question: {{question}}'

providers:
  - openai:gpt-4o-mini

# Parse JSON output so assertions can access properties directly
defaultTest:
  options:
    transform: JSON.parse(output)

tests:
  # Math problems use math schema
  - vars:
      question: 'What is 15 * 7?'
    options:
      response_format: file://./schemas/math-response-format.json
    assert:
      - type: javascript
        value: output.answer === 105

  # Comparison questions use comparison schema
  - vars:
      question: 'Compare apples and oranges'
    options:
      response_format: file://./schemas/comparison-response-format.json
    assert:
      - type: javascript
        value: output.winner === 'item1' || output.winner === 'item2' || output.winner === 'tie'
```

Each schema file contains the complete `response_format` object. See the [per-test schema example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-structured-output/per-test-schema.yaml) for a full working configuration.

## Supported environment variables

These OpenAI-related environment variables are supported:

| Variable                       | Description                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_TEMPERATURE`           | Temperature model parameter, defaults to 0. Not supported by reasoning models.                                                                              |
| `OPENAI_MAX_TOKENS`            | Max_tokens model parameter, defaults to 1024. Not supported by reasoning models.                                                                            |
| `OPENAI_MAX_COMPLETION_TOKENS` | Max_completion_tokens model parameter, defaults to 1024. Used by reasoning models.                                                                          |
| `OPENAI_REASONING_EFFORT`      | Reasoning effort parameter for reasoning models, defaults to "medium". Options are "low", "medium", or "high". Maps to `reasoning.effort` config parameter. |
| `OPENAI_API_HOST`              | The hostname to use (useful if you're using an API proxy). Takes priority over `OPENAI_BASE_URL`.                                                           |
| `OPENAI_BASE_URL`              | The base URL (protocol + hostname + port) to use, this is a more general option than `OPENAI_API_HOST`.                                                     |
| `OPENAI_API_KEY`               | OpenAI API key.                                                                                                                                             |
| `OPENAI_ORGANIZATION`          | The OpenAI organization key to use.                                                                                                                         |
| `PROMPTFOO_DELAY_MS`           | Number of milliseconds to delay between API calls. Useful if you are hitting OpenAI rate limits (defaults to 0).                                            |
| `PROMPTFOO_REQUEST_BACKOFF_MS` | Base number of milliseconds to backoff and retry if a request fails (defaults to 5000).                                                                     |

## Evaluating assistants

To test out an Assistant via OpenAI's Assistants API, first create an Assistant in the [API playground](https://platform.openai.com/playground).

Set functions, code interpreter, and files for retrieval as necessary.

Then, include the assistant in your config:

```yaml
prompts:
  - 'Write a tweet about {{topic}}'
providers:
  - openai:assistant:asst_fEhNN3MClMamLfKLkIaoIpgZ
tests:
  - vars:
      topic: bananas
  # ...
```

Code interpreter, function calls, and retrievals will be included in the output alongside chat messages. Note that the evaluator creates a new thread for each eval.

The following properties can be overwritten in provider config:

- `model` - OpenAI model to use
- `instructions` - System prompt
- `tools` - Enabled [tools](https://platform.openai.com/docs/api-reference/runs/createRun)
- `thread.messages` - A list of message objects that the thread is created with.
- `temperature` - Temperature for the model
- `toolChoice` - Controls whether the AI should use a tool
- `tool_resources` - Tool resources to include in the thread - see [Assistant v2 tool resources](https://platform.openai.com/docs/assistants/migration)
- `attachments` - File attachments to include in messages - see [Assistant v2 attachments](https://platform.openai.com/docs/assistants/migration)

Here's an example of a more detailed config:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - 'Write a tweet about {{topic}}'
providers:
  // highlight-start
  - id: openai:assistant:asst_fEhNN3MClMamLfKLkIaoIpgZ
    config:
      model: gpt-5
      instructions: "You always speak like a pirate"
      temperature: 0.2
      toolChoice:
        type: file_search
      tools:
        - type: code_interpreter
        - type: file_search
      thread:
        messages:
          - role: user
            content: "Hello world"
          - role: assistant
            content: "Greetings from the high seas"
  // highlight-end
tests:
  - vars:
      topic: bananas
  # ...
```

### Automatically handling function tool calls

You can specify JavaScript callbacks that are automatically called to create
the output of a function tool call.

This requires defining your config in a JavaScript file instead of YAML.

```js
module.exports = /** @type {import('promptfoo').TestSuiteConfig} */ ({
  prompts: 'Please add the following numbers together: {{a}} and {{b}}',
  providers: [
    {
      id: 'openai:assistant:asst_fEhNN3MClMamLfKLkIaoIpgZ',
      config: {
        model: 'gpt-5',
        instructions: 'You can add two numbers together using the `addNumbers` tool',
        tools: [
          {
            type: 'function',
            function: {
              name: 'addNumbers',
              description: 'Add two numbers together',
              parameters: {
                type: 'object',
                properties: {
                  a: { type: 'number' },
                  b: { type: 'number' },
                },
                required: ['a', 'b'],
                additionalProperties: false,
              },
              strict: true,
            },
          },
        ],
        /**
         * Map of function tool names to function callback.
         */
        functionToolCallbacks: {
          // this function should accept a JSON-parsed value, and return a string
          // or a `Promise<string>`.
          addNumbers: (parameters) => {
            const { a, b } = parameters;
            return JSON.stringify(a + b);
          },
        },
      },
    },
  ],
  tests: [
    {
      vars: { a: 5, b: 6 },
    },
  ],
});
```

## Audio capabilities

OpenAI models with audio support (like `gpt-audio`, `gpt-audio-mini`, `gpt-4o-audio-preview` and `gpt-4o-mini-audio-preview`) can process audio inputs and generate audio outputs. This enables testing speech-to-text, text-to-speech, and speech-to-speech capabilities.

**Available audio models:**

- `gpt-audio` - Latest audio model ($2.50/$10 per 1M text tokens, $40/$80 per 1M audio tokens)
- `gpt-audio-mini` - Cost-efficient audio model ($0.60/$2.40 per 1M text tokens, $10/$20 per 1M audio tokens)
- `gpt-4o-audio-preview` - Preview audio model
- `gpt-4o-mini-audio-preview` - Preview mini audio model

### Using audio inputs

You can include audio files in your prompts using the following format:

```json title="audio-input.json"
[
  {
    "role": "user",
    "content": [
      {
        "type": "text",
        "text": "You are a helpful customer support agent. Listen to the customer's request and respond with a helpful answer."
      },
      {
        "type": "input_audio",
        "input_audio": {
          "data": "{{audio_file}}",
          "format": "mp3"
        }
      }
    ]
  }
]
```

With a corresponding configuration:

```yaml title="promptfooconfig.yaml"
prompts:
  - id: file://audio-input.json
    label: Audio Input

providers:
  - id: openai:chat:gpt-4o-audio-preview
    config:
      modalities: ['text'] # also supports 'audio'

tests:
  - vars:
      audio_file: file://assets/transcript1.mp3
    assert:
      - type: llm-rubric
        value: Resolved the customer's issue
```

Supported audio file formats include WAV, MP3, OGG, AAC, M4A, and FLAC.

### Audio configuration options

The audio configuration supports these parameters:

| Parameter | Description                    | Default | Options                                 |
| --------- | ------------------------------ | ------- | --------------------------------------- |
| `voice`   | Voice for audio generation     | alloy   | alloy, echo, fable, onyx, nova, shimmer |
| `format`  | Audio format to generate       | wav     | wav, mp3, opus, aac                     |
| `speed`   | Speaking speed multiplier      | 1.0     | Any number between 0.25 and 4.0         |
| `bitrate` | Bitrate for compressed formats | -       | e.g., "128k", "256k"                    |

In the web UI, audio outputs display with an embedded player and transcript. For a complete working example, see the [OpenAI audio example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-audio) or initialize it with:

```bash
npx promptfoo@latest init --example openai-audio
```

### Audio transcription

OpenAI provides dedicated transcription models for converting speech to text. These models charge per minute of audio rather than per token.

**Available transcription models:**

| Model                       | Description                          | Cost per minute |
| --------------------------- | ------------------------------------ | --------------- |
| `whisper-1`                 | Original Whisper transcription model | $0.006          |
| `gpt-4o-transcribe`         | GPT-4o optimized for transcription   | $0.006          |
| `gpt-4o-mini-transcribe`    | Faster, more cost-effective option   | $0.003          |
| `gpt-4o-transcribe-diarize` | Identifies different speakers        | $0.006          |

To use transcription models, specify the provider format `openai:transcription:<model name>`:

```yaml title="promptfooconfig.yaml"
prompts:
  - file://sample-audio.mp3

providers:
  - id: openai:transcription:whisper-1
    config:
      language: en # Optional: specify language for better accuracy
      temperature: 0 # Optional: 0 for more deterministic output

  - id: openai:transcription:gpt-4o-transcribe
    config:
      language: en
      prompt: This is a technical discussion about AI and machine learning.

  - id: openai:transcription:gpt-4o-transcribe-diarize
    config:
      num_speakers: 2 # Optional: expected number of speakers
      speaker_labels: ['Alice', 'Bob'] # Optional: provide speaker names

tests:
  - assert:
      - type: contains
        value: expected transcript content
```

#### Transcription configuration options

| Parameter                 | Description                               | Options                |
| ------------------------- | ----------------------------------------- | ---------------------- |
| `language`                | Language of the audio (ISO-639-1)         | e.g., 'en', 'es', 'fr' |
| `prompt`                  | Context to improve transcription accuracy | Any text string        |
| `temperature`             | Controls randomness (0-1)                 | Number between 0 and 1 |
| `timestamp_granularities` | Get word or segment-level timestamps      | ['word', 'segment']    |
| `num_speakers`            | Expected number of speakers (diarization) | Number                 |
| `speaker_labels`          | Names for speakers (diarization)          | Array of strings       |

Supported audio formats include MP3, MP4, MPEG, MPGA, M4A, WAV, and WEBM.

#### Diarization example

The diarization model identifies different speakers in the audio:

```yaml title="promptfooconfig.yaml"
prompts:
  - file://interview.mp3

providers:
  - id: openai:transcription:gpt-4o-transcribe-diarize
    config:
      num_speakers: 2
      speaker_labels: ['Interviewer', 'Guest']

tests:
  - assert:
      - type: contains
        value: Interviewer
      - type: contains
        value: Guest
```

For a complete working example, see the [OpenAI audio transcription example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-audio-transcription) or initialize it with:

```bash
npx promptfoo@latest init --example openai-audio-transcription
```

## Realtime API Models

The Realtime API allows for real-time communication with GPT-4o class models using WebSockets, supporting both text and audio inputs/outputs with streaming responses.

### Supported Realtime Models

- `gpt-realtime` - Latest realtime model ($4/$16 per 1M text tokens, $40/$80 per 1M audio tokens)
- `gpt-realtime-mini` - Cost-efficient realtime model ($0.60/$2.40 per 1M text tokens, $10/$20 per 1M audio tokens)
- `gpt-4o-realtime-preview-2024-12-17`
- `gpt-5-mini-realtime-preview-2024-12-17`

### Using Realtime API

To use the OpenAI Realtime API, use the provider format `openai:realtime:<model name>`:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:realtime:gpt-4o-realtime-preview-2024-12-17
    config:
      modalities: ['text', 'audio']
      voice: 'alloy'
      instructions: 'You are a helpful assistant.'
      temperature: 0.7
      websocketTimeout: 60000 # 60 seconds
      # Optional: point to custom/proxy endpoints; WS URL is derived automatically
      # https:// → wss://, http:// → ws://
      # Example: wss://my-custom-api.com/v1/realtime
      # Example: ws://localhost:8080/v1/realtime
      # apiBaseUrl: 'https://my-custom-api.com/v1'
```

### Realtime-specific Configuration Options

The Realtime API configuration supports these parameters in addition to standard OpenAI parameters:

| Parameter                    | Description                                         | Default                | Options                                 |
| ---------------------------- | --------------------------------------------------- | ---------------------- | --------------------------------------- |
| `modalities`                 | Types of content the model can process and generate | ['text', 'audio']      | 'text', 'audio'                         |
| `voice`                      | Voice for audio generation                          | 'alloy'                | alloy, echo, fable, onyx, nova, shimmer |
| `instructions`               | System instructions for the model                   | 'You are a helpful...' | Any text string                         |
| `input_audio_format`         | Format of audio input                               | 'pcm16'                | 'pcm16', 'g711_ulaw', 'g711_alaw'       |
| `output_audio_format`        | Format of audio output                              | 'pcm16'                | 'pcm16', 'g711_ulaw', 'g711_alaw'       |
| `websocketTimeout`           | Timeout for WebSocket connection (milliseconds)     | 30000                  | Any number                              |
| `max_response_output_tokens` | Maximum tokens in model response                    | 'inf'                  | Number or 'inf'                         |
| `tools`                      | Array of tool definitions for function calling      | []                     | Array of tool objects                   |
| `tool_choice`                | Controls how tools are selected                     | 'auto'                 | 'none', 'auto', 'required', or object   |

#### Custom endpoints and proxies (Realtime)

The Realtime provider respects the same base URL configuration as other OpenAI providers. The WebSocket URL is derived from `getApiUrl()` by converting protocols: `https://` → `wss://` and `http://` → `ws://`.

You can use this to target Azure-compatible endpoints, proxies, or local/dev servers:

```yaml
providers:
  - id: openai:realtime:gpt-4o-realtime-preview
    config:
      apiBaseUrl: 'https://my-custom-api.com/v1' # connects to wss://my-custom-api.com/v1/realtime
      modalities: ['text']
      temperature: 0.7
```

Environment variables `OPENAI_API_BASE_URL` and `OPENAI_BASE_URL` also apply to Realtime WebSocket connections.

### Function Calling with Realtime API

The Realtime API supports function calling via tools, similar to the Chat API. Here's an example configuration:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:realtime:gpt-4o-realtime-preview-2024-12-17
    config:
      tools:
        - type: function
          name: get_weather
          description: Get the current weather for a location
          parameters:
            type: object
            properties:
              location:
                type: string
                description: The city and state, e.g. San Francisco, CA
            required: ['location']
      tool_choice: 'auto'
```

### Complete Example

For a complete working example that demonstrates the Realtime API capabilities, see the [OpenAI Realtime API example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-realtime) or initialize it with:

```bash
npx promptfoo@latest init --example openai-realtime
```

This example includes:

- Basic single-turn interactions with the Realtime API
- Multi-turn conversations with persistent context
- Conversation threading with separate conversation IDs
- JavaScript prompt function for properly formatting messages
- Function calling with the Realtime API
- Detailed documentation on handling content types correctly

### Input and Message Format

When using the Realtime API with promptfoo, you can specify the prompt in JSON format:

```json title="realtime-input.json"
[
  {
    "role": "user",
    "content": [
      {
        "type": "text",
        "text": "{{question}}"
      }
    ]
  }
]
```

The Realtime API supports the same multimedia formats as the Chat API, allowing you to include images and audio in your prompts.

### Multi-Turn Conversations

The Realtime API supports multi-turn conversations with persistent context. For implementation details and examples, see the [OpenAI Realtime example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-realtime), which demonstrates both single-turn interactions and conversation threading using the `conversationId` metadata property.

> **Important**: When implementing multi-turn conversations, use `type: "input_text"` for user inputs and `type: "text"` for assistant responses.

## Responses API

OpenAI's Responses API is the most advanced interface for generating model responses, supporting text and image inputs, function calling, and conversation state. It provides access to OpenAI's full suite of features including reasoning models like o1, o3, and o4 series.

### Supported Responses Models

The Responses API supports a wide range of models, including:

- `gpt-5` - OpenAI's most capable vision model
- `o1` - Powerful reasoning model
- `o1-mini` - Smaller, more affordable reasoning model
- `o1-pro` - Enhanced reasoning model with more compute
- `o3-pro` - Highest-tier reasoning model
- `o3` - OpenAI's most powerful reasoning model
- `o3-mini` - Smaller, more affordable reasoning model
- `o4-mini` - Latest fast, cost-effective reasoning model
- `codex-mini-latest` - Fast reasoning model optimized for the Codex CLI
- `gpt-5-codex` - GPT-5 based coding model optimized for code generation
- `gpt-5-pro` - Premium GPT-5 model with highest reasoning capability ($15/$120 per 1M tokens)

### Using the Responses API

To use the OpenAI Responses API, use the provider format `openai:responses:<model name>`:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:responses:gpt-5
    config:
      temperature: 0.7
      max_output_tokens: 500
      instructions: 'You are a helpful, creative AI assistant.'
```

### Responses-specific Configuration Options

The Responses API configuration supports these parameters in addition to standard OpenAI parameters:

| Parameter              | Description                                       | Default    | Options                             |
| ---------------------- | ------------------------------------------------- | ---------- | ----------------------------------- |
| `instructions`         | System instructions for the model                 | None       | Any text string                     |
| `max_output_tokens`    | Maximum tokens to generate in the response        | 1024       | Any number                          |
| `metadata`             | Key-value pairs attached to the model response    | None       | Map of string keys to string values |
| `parallel_tool_calls`  | Allow model to run tool calls in parallel         | true       | Boolean                             |
| `previous_response_id` | ID of a previous response for multi-turn context  | None       | String                              |
| `store`                | Whether to store the response for later retrieval | true       | Boolean                             |
| `truncation`           | Strategy to handle context window overflow        | 'disabled' | 'auto', 'disabled'                  |
| `reasoning`            | Configuration for reasoning models                | None       | Object with `effort` field          |

### MCP (Model Context Protocol) Support

The Responses API supports OpenAI's MCP integration, allowing models to use remote MCP servers to perform tasks. MCP tools enable access to external services and APIs through a standardized protocol.

#### Basic MCP Configuration

To use MCP tools with the Responses API, add them to the `tools` array:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:responses:gpt-5
    config:
      tools:
        - type: mcp
          server_label: deepwiki
          server_url: https://mcp.deepwiki.com/mcp
          require_approval: never
```

#### MCP Tool Configuration Options

| Parameter          | Description                             | Required | Options                                  |
| ------------------ | --------------------------------------- | -------- | ---------------------------------------- |
| `type`             | Tool type (must be 'mcp')               | Yes      | 'mcp'                                    |
| `server_label`     | Label to identify the MCP server        | Yes      | Any string                               |
| `server_url`       | URL of the remote MCP server            | Yes      | Valid URL                                |
| `require_approval` | Approval settings for tool calls        | No       | 'never' or object with approval settings |
| `allowed_tools`    | Specific tools to allow from the server | No       | Array of tool names                      |
| `headers`          | Custom headers for authentication       | No       | Object with header key-value pairs       |

#### Authentication with MCP Servers

Most MCP servers require authentication. Use the `headers` parameter to provide API keys or tokens:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:responses:gpt-5
    config:
      tools:
        - type: mcp
          server_label: stripe
          server_url: https://mcp.stripe.com
          headers:
            Authorization: 'Bearer sk-test_...'
          require_approval: never
```

#### Filtering MCP Tools

To limit which tools are available from an MCP server, use the `allowed_tools` parameter:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:responses:gpt-5
    config:
      tools:
        - type: mcp
          server_label: deepwiki
          server_url: https://mcp.deepwiki.com/mcp
          allowed_tools: ['ask_question']
          require_approval: never
```

#### Approval Settings

By default, OpenAI requires approval before sharing data with MCP servers. You can configure approval settings:

```yaml title="promptfooconfig.yaml"
# Never require approval for all tools
providers:
  - id: openai:responses:gpt-5
    config:
      tools:
        - type: mcp
          server_label: deepwiki
          server_url: https://mcp.deepwiki.com/mcp
          require_approval: never

# Never require approval for specific tools only
providers:
  - id: openai:responses:gpt-5
    config:
      tools:
        - type: mcp
          server_label: deepwiki
          server_url: https://mcp.deepwiki.com/mcp
          require_approval:
            never:
              tool_names: ["ask_question", "read_wiki_structure"]
```

#### Complete MCP Example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - 'What are the transport protocols supported in the MCP specification for {{repo}}?'

providers:
  - id: openai:responses:gpt-5
    config:
      tools:
        - type: mcp
          server_label: deepwiki
          server_url: https://mcp.deepwiki.com/mcp
          require_approval: never
          allowed_tools: ['ask_question']

tests:
  - vars:
      repo: modelcontextprotocol/modelcontextprotocol
    assert:
      - type: contains
        value: 'transport protocols'
```

For a complete working example, see the [OpenAI MCP example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-mcp) or initialize it with:

```bash
npx promptfoo@latest init --example openai-mcp
```

### Reasoning Models

When using reasoning models like `o1`, `o1-pro`, `o3`, `o3-pro`, `o3-mini`, or `o4-mini`, you can control the reasoning effort:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:responses:o3
    config:
      reasoning:
        effort: 'medium' # Can be "low", "medium", or "high"
      max_output_tokens: 1000
```

Reasoning models "think before they answer," generating internal reasoning that isn't visible in the output but counts toward token usage and billing.

### o3 and o4-mini Models

OpenAI offers advanced reasoning models in the o-series:

#### o3 and o4-mini

These reasoning models provide different performance and efficiency profiles:

- **o3**: Powerful reasoning model, optimized for complex mathematical, scientific, and coding tasks
- **o4-mini**: Efficient reasoning model with strong performance in coding and visual tasks at lower cost

Both models feature:

- Large context window (200,000 tokens)
- High maximum output tokens (100,000 tokens)

For current specifications and pricing information, refer to [OpenAI's pricing page](https://openai.com/pricing).

Example configuration:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:responses:o3
    config:
      reasoning:
        effort: 'high'
      max_output_tokens: 2000

  - id: openai:responses:o4-mini
    config:
      reasoning:
        effort: 'medium'
      max_output_tokens: 1000
```

### Deep Research Models (Responses API Only)

Deep research models (`o3-deep-research`, `o4-mini-deep-research`) are specialized reasoning models designed for complex research tasks that require web search capabilities.

Available models:

- `o3-deep-research` - Most powerful deep research model ($10/1M input, $40/1M output)
- `o3-deep-research-2025-06-26` - Snapshot version
- `o4-mini-deep-research` - Faster, more affordable ($2/1M input, $8/1M output)
- `o4-mini-deep-research-2025-06-26` - Snapshot version

All deep research models:

- **Require** `web_search_preview` tool to be configured
- Support 200,000 token context window
- Support up to 100,000 output tokens
- May take 2-10 minutes to complete research tasks
- Use significant tokens for reasoning before generating output

Example configuration:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:responses:o4-mini-deep-research
    config:
      max_output_tokens: 50000 # High limit recommended
      tools:
        - type: web_search_preview # Required
```

#### Advanced Configuration

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:responses:o3-deep-research
    config:
      max_output_tokens: 100000
      max_tool_calls: 50 # Limit searches to control cost/latency
      background: true # Recommended for long-running tasks
      store: true # Store conversation for 30 days
      tools:
        - type: web_search_preview # Required
        - type: code_interpreter # Optional: For data analysis
          container:
            type: auto
        - type: mcp # Optional: Connect to private data
          server_label: mycompany_data
          server_url: https://api.mycompany.com/mcp
          require_approval: never # Must be 'never' for deep research
```

#### Response Format

Deep research models return specialized output items:

- **web_search_call**: Web search actions (search, open_page, find_in_page)
- **code_interpreter_call**: Code execution for analysis
- **message**: Final answer with inline citations and annotations

Example response structure:

```json
{
  "output": [
    {
      "type": "web_search_call",
      "action": {
        "type": "search",
        "query": "latest AI research papers 2025"
      }
    },
    {
      "type": "message",
      "content": [
        {
          "type": "output_text",
          "text": "Based on my research...",
          "annotations": [
            {
              "url": "https://arxiv.org/...",
              "title": "Paper Title",
              "start_index": 123,
              "end_index": 145
            }
          ]
        }
      ]
    }
  ]
}
```

#### Best Practices

1. **Use Background Mode**: For production, always use `background: true` to handle long response times
2. **Set High Token Limits**: Use `max_output_tokens: 50000` or higher
3. **Configure Timeouts**: Set `PROMPTFOO_EVAL_TIMEOUT_MS=600000` for 10-minute timeouts
4. **Control Costs**: Use `max_tool_calls` to limit the number of searches
5. **Enhance Prompts**: Consider using a faster model to clarify/rewrite prompts before deep research

#### Timeout Configuration

Deep research models automatically use appropriate timeouts:

- If `PROMPTFOO_EVAL_TIMEOUT_MS` is set, it will be used for the API call
- Otherwise, deep research models default to a 10-minute timeout (600,000ms)
- Regular models continue to use the standard 5-minute timeout

Example:

```bash
# Set a custom timeout for all evaluations
export PROMPTFOO_EVAL_TIMEOUT_MS=900000  # 15 minutes

# Or set the default API timeout (affects all providers)
export REQUEST_TIMEOUT_MS=600000  # 10 minutes
```

:::tip
Deep research models require high `max_output_tokens` values (50,000+) and long timeouts. Set `PROMPTFOO_EVAL_TIMEOUT_MS=600000` for 10-minute timeouts.
:::

:::warning
The `web_search_preview` tool is **required** for deep research models. The provider will return an error if this tool is not configured.
:::

### GPT-5-pro Timeout Configuration

GPT-5-pro is a long-running model that often requires extended timeouts due to its advanced reasoning capabilities. Like deep research models, GPT-5-pro **automatically** receives a 10-minute timeout (600,000ms) instead of the standard 5-minute timeout.

**Automatic timeout behavior:**

- GPT-5-pro automatically gets a 10-minute timeout (600,000ms) - **no configuration needed**
- If you need longer, set `PROMPTFOO_EVAL_TIMEOUT_MS` (e.g., 900000 for 15 minutes)
- `REQUEST_TIMEOUT_MS` is **ignored** for GPT-5-pro (the automatic timeout takes precedence)

**Most users won't need any timeout configuration** - the automatic 10-minute timeout is sufficient for most GPT-5-pro requests.

**If you experience timeouts, configure this:**

```bash
# Only if you need more than the automatic 10 minutes
export PROMPTFOO_EVAL_TIMEOUT_MS=1200000   # 20 minutes

# For infrastructure reliability (recommended)
export PROMPTFOO_RETRY_5XX=true            # Retry 502 Bad Gateway errors
export PROMPTFOO_REQUEST_BACKOFF_MS=10000  # Longer retry backoff

# Reduce concurrency to avoid rate limits
promptfoo eval --max-concurrency 2
```

**Common GPT-5-pro errors and solutions:**

If you encounter errors with GPT-5-pro:

1. **Request timed out** - If GPT-5-pro needs more than the automatic 10 minutes, set `PROMPTFOO_EVAL_TIMEOUT_MS=1200000` (20 minutes)
2. **502 Bad Gateway** - Enable `PROMPTFOO_RETRY_5XX=true` to retry Cloudflare/OpenAI infrastructure timeouts
3. **getaddrinfo ENOTFOUND** - Transient DNS errors; reduce concurrency with `--max-concurrency 2`
4. **Upstream connection errors** - OpenAI load balancer issues; increase backoff with `PROMPTFOO_REQUEST_BACKOFF_MS=10000`

:::tip
GPT-5-pro automatically gets a 10-minute timeout - you likely don't need any timeout configuration. If you see infrastructure errors (502, DNS failures), enable `PROMPTFOO_RETRY_5XX=true` and reduce concurrency.
:::

### Sending Images in Prompts

The Responses API supports structured prompts with text and image inputs. Example:

```json title="prompt.json"
[
  {
    "type": "message",
    "role": "user",
    "content": [
      {
        "type": "input_text",
        "text": "Describe what you see in this image about {{topic}}."
      },
      {
        "type": "image_url",
        "image_url": {
          "url": "{{image_url}}"
        }
      }
    ]
  }
]
```

### Function Calling

The Responses API supports tool and function calling, similar to the Chat API:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:responses:gpt-5
    config:
      tools:
        - type: function
          function:
            name: get_weather
            description: Get the current weather for a location
            parameters:
              type: object
              properties:
                location:
                  type: string
                  description: The city and state, e.g. San Francisco, CA
              required: ['location']
      tool_choice: 'auto'
```

### Using with Azure

The Responses API can also be used with Azure OpenAI endpoints by configuring the `apiHost`:

```yaml
providers:
  - id: openai:responses:gpt-4.1
    config:
      apiHost: 'your-resource.openai.azure.com'
      apiKey: '{{ env.AZURE_API_KEY }}' # or set OPENAI_API_KEY env var
      temperature: 0.7
      instructions: 'You are a helpful assistant.'
      response_format: file://./response-schema.json
```

For comprehensive Azure Responses API documentation, see the [Azure provider documentation](/docs/providers/azure#azure-responses-api).

### Complete Example

For a complete working example, see the [OpenAI Responses API example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-responses) or initialize it with:

```bash
npx promptfoo@latest init --example openai-responses
```

## Troubleshooting

### OpenAI rate limits

Promptfoo automatically handles OpenAI rate limits with retry and adaptive concurrency. See [Rate Limits](/docs/configuration/rate-limits) for details.

If you need manual control, you can:

1. **Reduce concurrency** with `--max-concurrency 1` in the CLI or `evaluateOptions.maxConcurrency` in config
2. **Add fixed delays** with `--delay 3000` (milliseconds) or `evaluateOptions.delay` in config
3. **Adjust backoff** with `PROMPTFOO_REQUEST_BACKOFF_MS` environment variable (default: 5000ms)

### OpenAI flakiness

To retry HTTP requests that are Internal Server errors, set the `PROMPTFOO_RETRY_5XX` environment variable to `1`.

## Agentic Providers

OpenAI offers several agentic providers for different use cases:

### Agents SDK

Test multi-turn agentic workflows with the [OpenAI Agents provider](/docs/providers/openai-agents). This provider supports the [@openai/agents](https://github.com/openai/openai-agents-js) SDK with tools, handoffs, and tracing.

```yaml
providers:
  - openai:agents:my-agent
    config:
      agent: file://./agents/support-agent.ts
      tools: file://./tools/support-tools.ts
      maxTurns: 10
```

See the [OpenAI Agents documentation](/docs/providers/openai-agents) for full configuration options and examples.

### Codex SDK

For agentic coding tasks with working directory access and structured JSON output, use the [OpenAI Codex SDK provider](/docs/providers/openai-codex-sdk). This provider supports `gpt-5.1-codex` models optimized for code generation:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      model: gpt-5.1-codex
      working_dir: ./src
      output_schema:
        type: object
        properties:
          code: { type: string }
          explanation: { type: string }
```

See the [OpenAI Codex SDK documentation](/docs/providers/openai-codex-sdk) for thread management, structured output, and Git-aware operations.
