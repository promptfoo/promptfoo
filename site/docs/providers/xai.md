---
title: xAI (Grok) Provider
description: Deploy xAI Grok models including Grok 4.1 Fast and Grok-4 with advanced reasoning for agentic tool calling and complex analysis
keywords: [xai, grok, grok-4-1-fast, grok-4, grok-3, reasoning, vision, llm, agentic]
---

# xAI (Grok)

The `xai` provider supports [xAI's Grok models](https://x.ai/) through an API interface compatible with OpenAI's format. The provider supports both text and vision capabilities depending on the model used.

## Setup

To use xAI's API, set the `XAI_API_KEY` environment variable or specify via `apiKey` in the configuration file.

```sh
export XAI_API_KEY=your_api_key_here
```

## Supported Models

The xAI provider includes support for the following model formats:

### Grok 4.1 Fast Models

- `xai:grok-4-1-fast-reasoning` - Frontier model optimized for agentic tool calling with reasoning (2M context)
- `xai:grok-4-1-fast-non-reasoning` - Fast variant for instant responses without reasoning (2M context)
- `xai:grok-4-1-fast` - Alias for grok-4-1-fast-reasoning
- `xai:grok-4-1-fast-latest` - Alias for grok-4-1-fast-reasoning

### Grok Code Fast Models

- `xai:grok-code-fast-1` - Speedy and economical reasoning model optimized for agentic coding (256K context)
- `xai:grok-code-fast` - Alias for grok-code-fast-1
- `xai:grok-code-fast-1-0825` - Specific version of the code-fast model (256K context)

### Grok-4 Fast Models

- `xai:grok-4-fast-reasoning` - Fast reasoning model with 2M context window
- `xai:grok-4-fast-non-reasoning` - Fast non-reasoning model for instant responses (2M context)
- `xai:grok-4-fast` - Alias for grok-4-fast-reasoning
- `xai:grok-4-fast-latest` - Alias for grok-4-fast-reasoning

### Grok-4 Models

- `xai:grok-4-0709` - Flagship reasoning model (256K context)
- `xai:grok-4` - Alias for latest Grok-4 model
- `xai:grok-4-latest` - Alias for latest Grok-4 model

### Grok-3 Models

- `xai:grok-3-beta` - Latest flagship model for enterprise tasks (131K context)
- `xai:grok-3-fast-beta` - Fastest flagship model (131K context)
- `xai:grok-3-mini-beta` - Smaller model for basic tasks, supports reasoning effort (32K context)
- `xai:grok-3-mini-fast-beta` - Faster mini model, supports reasoning effort (32K context)
- `xai:grok-3` - Alias for grok-3-beta
- `xai:grok-3-latest` - Alias for grok-3-beta
- `xai:grok-3-fast` - Alias for grok-3-fast-beta
- `xai:grok-3-fast-latest` - Alias for grok-3-fast-beta
- `xai:grok-3-mini` - Alias for grok-3-mini-beta
- `xai:grok-3-mini-latest` - Alias for grok-3-mini-beta
- `xai:grok-3-mini-fast` - Alias for grok-3-mini-fast-beta
- `xai:grok-3-mini-fast-latest` - Alias for grok-3-mini-fast-beta

### Grok-2 and previous Models

- `xai:grok-2-latest` - Latest Grok-2 model (131K context)
- `xai:grok-2-vision-latest` - Latest Grok-2 vision model (32K context)
- `xai:grok-2-vision-1212`
- `xai:grok-2-1212`
- `xai:grok-beta` - Beta version (131K context)
- `xai:grok-vision-beta` - Vision beta version (8K context)

You can also use specific versioned models:

- `xai:grok-2-1212`
- `xai:grok-2-vision-1212`

## Configuration

The provider supports all [OpenAI provider](/docs/providers/openai) configuration options plus Grok-specific options. Example usage:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: xai:grok-3-mini-beta
    config:
      temperature: 0.7
      reasoning_effort: 'high' # Only for grok-3-mini models
      apiKey: your_api_key_here # Alternative to XAI_API_KEY
```

### Reasoning Support

Multiple Grok models support reasoning capabilities:

**Grok Code Fast Models**: The `grok-code-fast-1` family are reasoning models optimized for agentic coding workflows. They support:

- Function calling and tool usage
- Web search via `search_parameters`
- Fast inference with built-in reasoning

**Grok-3 Models**: The `grok-3-mini-beta` and `grok-3-mini-fast-beta` models support reasoning through the `reasoning_effort` parameter:

- `reasoning_effort: "low"` - Minimal thinking time, using fewer tokens for quick responses
- `reasoning_effort: "high"` - Maximum thinking time, leveraging more tokens for complex problems

:::info

For Grok-3, reasoning is only available for the mini variants. The standard `grok-3-beta` and `grok-3-fast-beta` models do not support reasoning.

:::

### Grok 4.1 Fast Specific Behavior

Grok 4.1 Fast is xAI's frontier model specifically optimized for agentic tool calling:

- **Two variants**: `grok-4-1-fast-reasoning` for maximum intelligence, `grok-4-1-fast-non-reasoning` for instant responses
- **Massive context window**: 2,000,000 tokens for handling complex multi-turn agent interactions
- **Optimized for tool calling**: Trained specifically for high-performance agentic tool calling via RL in simulated environments
- **Low latency and cost**: $0.20/1M input tokens, $0.50/1M output tokens with fast inference
- **Unsupported parameters**: Same restrictions as Grok-4 (no presence_penalty, frequency_penalty, stop, reasoning_effort)

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: xai:grok-4-1-fast-reasoning
    config:
      temperature: 0.7
      max_completion_tokens: 4096
```

### Grok-4 Fast Specific Behavior

Grok-4 Fast models offer the same capabilities as Grok-4 but with faster inference and lower cost:

- **Two variants**: `grok-4-fast-reasoning` for reasoning tasks, `grok-4-fast-non-reasoning` for instant responses
- **2M context window**: Same large context as Grok 4.1 Fast
- **Same parameter restrictions as Grok-4**: No presence_penalty, frequency_penalty, stop, or reasoning_effort

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: xai:grok-4-fast-reasoning
    config:
      temperature: 0.7
      max_completion_tokens: 4096
```

### Grok-4 Specific Behavior

Grok-4 introduces significant changes compared to previous Grok models:

- **Always uses reasoning**: Grok-4 is a reasoning model that always operates at maximum reasoning capacity
- **No `reasoning_effort` parameter**: Unlike Grok-3 mini models, Grok-4 does not support the `reasoning_effort` parameter
- **Unsupported parameters**: The following parameters are not supported and will be automatically filtered out:
  - `presencePenalty` / `presence_penalty`
  - `frequencyPenalty` / `frequency_penalty`
  - `stop`
- **Larger context window**: 256,000 tokens compared to 131,072 for Grok-3 models
- **Uses `max_completion_tokens`**: As a reasoning model, Grok-4 uses `max_completion_tokens` instead of `max_tokens`

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: xai:grok-4
    config:
      temperature: 0.7
      max_completion_tokens: 4096
```

### Grok Code Fast Specific Behavior

The Grok Code Fast models are optimized for agentic coding workflows and offer several key features:

- **Built for Speed**: Designed to be highly responsive for agentic coding tools where multiple tool calls are common
- **Economical Pricing**: At $0.20/1M input tokens and $1.50/1M output tokens, significantly more affordable than flagship models
- **Reasoning Capabilities**: Built-in reasoning for code analysis, debugging, and problem-solving
- **Tool Integration**: Excellent support for function calling, tool usage, and web search
- **Coding Expertise**: Particularly adept at TypeScript, Python, Java, Rust, C++, and Go

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: xai:grok-code-fast-1
    # or use the alias:
    # - id: xai:grok-code-fast
    config:
      temperature: 0.1 # Lower temperature often preferred for coding tasks
      max_completion_tokens: 4096
      search_parameters:
        mode: auto # Enable web search for coding assistance
```

### Region Support

You can specify a region to use a region-specific API endpoint:

```yaml
providers:
  - id: xai:grok-2-latest
    config:
      region: us-west-1 # Will use https://us-west-1.api.x.ai/v1
```

This is equivalent to setting `base_url="https://us-west-1.api.x.ai/v1"` in the Python client.

### Live Search (Beta)

:::warning Deprecation Notice

xAI has announced that the Live Search API (via `search_parameters`) will be **deprecated by December 15, 2025**. The replacement is the Agent Tools API, which provides enhanced agentic search capabilities. Agent Tools require the Responses API endpoint - see the [Agent Tools API](#agent-tools-api-responses-api) section for more details.

:::

You can optionally enable Grok's **Live Search** feature to let the model pull in real-time information from the web or X. Pass a `search_parameters` object in your provider config. The `mode` field controls how search is used:

- `off` – Disable search
- `auto` – Model decides when to search (default)
- `on` – Always perform live search

Additional fields like `sources`, `from_date`, `to_date`, and `return_citations` may also be provided.

```yaml title="promptfooconfig.yaml"
providers:
  - id: xai:grok-3-beta
    config:
      search_parameters:
        mode: auto
        return_citations: true
        sources:
          - type: web
```

For a full list of options see the [xAI documentation](https://docs.x.ai/docs).

### Agent Tools API (Responses API)

Use the `xai:responses:<model>` provider to access xAI's Agent Tools API, which enables autonomous server-side tool execution for web search, X search, and code interpretation.

```yaml title="promptfooconfig.yaml"
providers:
  - id: xai:responses:grok-4-1-fast-reasoning
    config:
      temperature: 0.7
      max_output_tokens: 4096
      tools:
        - type: web_search
        - type: x_search
```

#### Available Agent Tools

| Tool                 | Description                        |
| -------------------- | ---------------------------------- |
| `web_search`         | Search the web and browse pages    |
| `x_search`           | Search X posts, users, and threads |
| `code_interpreter`   | Execute Python code in a sandbox   |
| `collections_search` | Search uploaded knowledge bases    |
| `mcp`                | Connect to remote MCP servers      |

#### Web Search Tool

```yaml
tools:
  - type: web_search
    filters:
      allowed_domains:
        - example.com
        - news.com
      # OR excluded_domains (cannot use both)
    enable_image_understanding: true
```

#### X Search Tool

```yaml
tools:
  - type: x_search
    from_date: '2025-01-01' # ISO8601 format
    to_date: '2025-11-27'
    allowed_x_handles:
      - elonmusk
    enable_image_understanding: true
    enable_video_understanding: true
```

#### Code Interpreter Tool

```yaml
tools:
  - type: code_interpreter
    container:
      pip_packages:
        - numpy
        - pandas
```

#### Complete Example

```yaml title="promptfooconfig.yaml"
providers:
  - id: xai:responses:grok-4-fast
    config:
      temperature: 0.7
      tools:
        - type: web_search
          enable_image_understanding: true
        - type: x_search
          from_date: '2025-01-01'
        - type: code_interpreter
          container:
            pip_packages:
              - numpy
      tool_choice: auto # auto, required, or none
      parallel_tool_calls: true

tests:
  - vars:
      question: What's the latest AI news? Search the web and X.
    assert:
      - type: contains
        value: AI
```

#### Responses API Configuration

| Parameter              | Type    | Description                               |
| ---------------------- | ------- | ----------------------------------------- |
| `temperature`          | number  | Sampling temperature (0-2)                |
| `max_output_tokens`    | number  | Maximum tokens to generate                |
| `top_p`                | number  | Nucleus sampling parameter                |
| `tools`                | array   | Agent tools to enable                     |
| `tool_choice`          | string  | Tool selection mode: auto, required, none |
| `parallel_tool_calls`  | boolean | Allow parallel tool execution             |
| `instructions`         | string  | System-level instructions                 |
| `previous_response_id` | string  | For multi-turn conversations              |
| `store`                | boolean | Store response for later retrieval        |
| `response_format`      | object  | JSON schema for structured output         |

#### Supported Models

The Responses API works with Grok 4 models:

- `grok-4-1-fast-reasoning` (recommended for agentic workflows)
- `grok-4-1-fast-non-reasoning`
- `grok-4-fast-reasoning`
- `grok-4-fast-non-reasoning`
- `grok-4`

#### Migration from Live Search

If you're using Live Search via `search_parameters`, migrate to the Responses API before December 15, 2025:

**Before (Live Search - deprecated):**

```yaml
providers:
  - id: xai:grok-4-1-fast-reasoning
    config:
      search_parameters:
        mode: auto
        sources:
          - type: web
          - type: x
```

**After (Responses API):**

```yaml
providers:
  - id: xai:responses:grok-4-1-fast-reasoning
    config:
      tools:
        - type: web_search
        - type: x_search
```

### Deferred Chat Completions

:::info Not Yet Supported

xAI offers [Deferred Chat Completions](https://docs.x.ai/docs/guides/deferred-chat-completions) for long-running requests that can be retrieved asynchronously via a `request_id`. This feature is not yet supported in promptfoo. For async workflows, use the xAI Python SDK directly.

:::

### Function Calling

xAI supports standard OpenAI-compatible function calling for client-side tool execution:

```yaml title="promptfooconfig.yaml"
providers:
  - id: xai:grok-4-1-fast-reasoning
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
                  description: City and state
              required:
                - location
```

### Structured Outputs

xAI supports structured outputs via JSON schema:

```yaml title="promptfooconfig.yaml"
providers:
  - id: xai:grok-4
    config:
      response_format:
        type: json_schema
        json_schema:
          name: analysis_result
          strict: true
          schema:
            type: object
            properties:
              summary:
                type: string
              confidence:
                type: number
            required:
              - summary
              - confidence
            additionalProperties: false
```

You can also load schemas from external files:

```yaml
config:
  response_format: file://./schemas/analysis-schema.json
```

Nested file references and variable rendering are supported (see [OpenAI documentation](/docs/providers/openai#external-file-references) for details).

### Vision Support

For models with vision capabilities, you can include images in your prompts using the same format as OpenAI. Create a `prompt.yaml` file:

```yaml title="prompt.yaml"
- role: user
  content:
    - type: image_url
      image_url:
        url: '{{image_url}}'
        detail: 'high'
    - type: text
      text: '{{question}}'
```

Then reference it in your promptfoo config:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - file://prompt.yaml

providers:
  - id: xai:grok-2-vision-latest

tests:
  - vars:
      image_url: 'https://example.com/image.jpg'
      question: "What's in this image?"
```

### Image Generation

xAI also supports image generation through the Grok image model:

```yaml
providers:
  - xai:image:grok-2-image
```

Example configuration for image generation:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - 'A {{style}} painting of {{subject}}'

providers:
  - id: xai:image:grok-2-image
    config:
      n: 1 # Number of images to generate (1-10)
      response_format: 'url' # 'url' or 'b64_json'

tests:
  - vars:
      style: 'impressionist'
      subject: 'sunset over mountains'
```

### Video Generation

xAI supports video generation through the Grok Imagine API using the `xai:video:grok-imagine-video` provider:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - 'Generate a video of: {{scene}}'

providers:
  - id: xai:video:grok-imagine-video
    config:
      duration: 5 # 1-15 seconds
      aspect_ratio: '16:9'
      resolution: '720p'

tests:
  - vars:
      scene: a cat playing with yarn
    assert:
      - type: cost
        threshold: 1.0
```

#### Configuration Options

| Option             | Type   | Default | Description                                       |
| ------------------ | ------ | ------- | ------------------------------------------------- |
| `duration`         | number | 8       | Video length in seconds (1-15)                    |
| `aspect_ratio`     | string | 16:9    | Aspect ratio: 16:9, 4:3, 1:1, 9:16, 3:4, 3:2, 2:3 |
| `resolution`       | string | 720p    | Output resolution: 720p, 480p                     |
| `poll_interval_ms` | number | 10000   | Polling interval in milliseconds                  |
| `max_poll_time_ms` | number | 600000  | Maximum wait time (10 minutes)                    |

#### Image-to-Video

Animate a static image by providing an image URL:

```yaml
providers:
  - id: xai:video:grok-imagine-video
    config:
      image:
        url: 'https://example.com/image.jpg'
      duration: 5
```

#### Video Editing

Edit an existing video with text instructions:

```yaml
providers:
  - id: xai:video:grok-imagine-video
    config:
      video:
        url: 'https://example.com/source-video.mp4'

prompts:
  - 'Make the colors more vibrant and add slow motion'
```

:::note
Video editing skips duration, aspect ratio, and resolution validation since these are determined by the source video.
:::

#### Pricing

Video generation is billed at approximately **$0.05 per second** of generated video.

### Voice Agent API

The xAI Voice Agent API enables real-time voice conversations with Grok models via WebSocket. Use the `xai:voice:<model>` provider format.

```yaml
providers:
  - xai:voice:grok-3
```

#### Configuration

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: xai:voice:grok-3
    config:
      voice: 'Ara' # Ara, Rex, Sal, Eve, or Leo
      instructions: 'You are a helpful voice assistant.'
      modalities: ['text', 'audio']
      websocketTimeout: 60000 # Connection timeout in ms
      tools:
        - type: web_search
        - type: x_search
```

#### Available Voices

| Voice | Description  |
| ----- | ------------ |
| Ara   | Female voice |
| Rex   | Male voice   |
| Sal   | Male voice   |
| Eve   | Female voice |
| Leo   | Male voice   |

#### Built-in Tools

The Voice API includes server-side tools that execute automatically:

| Tool          | Description                            |
| ------------- | -------------------------------------- |
| `web_search`  | Search the web for information         |
| `x_search`    | Search posts on X (Twitter)            |
| `file_search` | Search uploaded files in vector stores |

```yaml
tools:
  - type: web_search
  - type: x_search
    allowed_x_handles:
      - elonmusk
      - xai
  - type: file_search
    vector_store_ids:
      - vs-123
    max_num_results: 10
```

#### Custom Function Tools and Assertions

You can define custom function tools inline or load them from external files:

```yaml title="promptfooconfig.yaml"
providers:
  - id: xai:voice:grok-3
    config:
      # Inline tool definition
      tools:
        - type: function
          name: set_volume
          description: Set the device volume level
          parameters:
            type: object
            properties:
              level:
                type: number
                description: Volume level from 0 to 100
            required:
              - level

      # Or load from external file (YAML or JSON)
      # tools: file://tools.yaml

tests:
  - vars:
      question: 'Set the volume to 50 percent'
    assert:
      # Check that the correct function was called with correct arguments
      - type: javascript
        value: |
          const calls = output.functionCalls || [];
          return calls.some(c => c.name === 'set_volume' && c.arguments?.level === 50);

      # Or use tool-call-f1 for function name matching
      - type: tool-call-f1
        value: ['set_volume']
        threshold: 1.0
```

**External tools file example:**

```yaml title="tools.yaml"
- type: function
  name: get_weather
  description: Get the current weather for a location
  parameters:
    type: object
    properties:
      location:
        type: string
    required:
      - location

- type: function
  name: set_reminder
  description: Set a reminder for the user
  parameters:
    type: object
    properties:
      message:
        type: string
      time:
        type: string
    required:
      - message
      - time
```

When function tools are used, the provider output includes a `functionCalls` array with:

- `name`: The function name that was called
- `arguments`: The parsed arguments object
- `result`: The result returned by your function handler (if provided)

#### Custom Endpoint Configuration

You can configure a custom WebSocket endpoint for the Voice API, useful for proxies or regional endpoints:

```yaml
providers:
  - id: xai:voice:grok-3
    config:
      # Option 1: Full base URL (transforms https:// to wss://)
      apiBaseUrl: 'https://my-proxy.example.com/v1'

      # Option 2: Host only (builds https://{host}/v1)
      # apiHost: 'my-proxy.example.com'
```

You can also use the `XAI_API_BASE_URL` environment variable:

```sh
export XAI_API_BASE_URL=https://my-proxy.example.com/v1
```

URL transformation: The provider automatically converts HTTP URLs to WebSocket URLs (`https://` → `wss://`, `http://` → `ws://`) and appends `/realtime` to reach the Voice API endpoint.

#### Complete WebSocket URL Override

For advanced use cases like local testing, custom proxies, or endpoints requiring query parameters, you can provide a complete WebSocket URL that will be used exactly as specified without any transformation:

```yaml
providers:
  - id: xai:voice:grok-3
    config:
      # Use this URL exactly as-is (no transformation applied)
      websocketUrl: 'wss://custom-endpoint.example.com/path?token=xyz&session=abc'
```

This is useful for:

- Local development and testing with mock servers
- Custom proxy configurations
- Adding authentication tokens or session IDs as URL parameters
- Using alternative WebSocket gateways or regional endpoints

#### Audio Configuration

Configure input/output audio formats:

```yaml
config:
  audio:
    input:
      format:
        type: audio/pcm
        rate: 24000
    output:
      format:
        type: audio/pcm
        rate: 24000
```

Supported formats: `audio/pcm`, `audio/pcmu`, `audio/pcma`
Supported sample rates: 8000, 16000, 22050, 24000, 32000, 44100, 48000 Hz

#### Complete Example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - file://input.json

providers:
  - id: xai:voice:grok-3
    config:
      voice: 'Ara'
      instructions: 'You are a helpful voice assistant.'
      modalities: ['text', 'audio']
      tools:
        - type: web_search

tests:
  - vars:
      question: 'What are the latest AI developments?'
    assert:
      - type: llm-rubric
        value: Provides information about recent AI news
```

#### Pricing

The Voice Agent API is billed at **$0.05 per minute** of connection time.

For more information on the available models and API usage, refer to the [xAI documentation](https://docs.x.ai/docs).

## Examples

For examples demonstrating text generation, image creation, and web search, see the [xai example](https://github.com/promptfoo/promptfoo/tree/main/examples/xai).

```bash
npx promptfoo@latest init --example xai
```

For real-time voice conversations with Grok, see the [xai-voice example](https://github.com/promptfoo/promptfoo/tree/main/examples/xai-voice).

```bash
npx promptfoo@latest init --example xai-voice
```

## See Also

- [OpenAI Provider](/docs/providers/openai)

## Troubleshooting

### 502 Bad Gateway Errors

If you encounter 502 Bad Gateway errors when using the xAI provider, this typically indicates:

- An invalid or missing API key
- Server issues on x.ai's side

The xAI provider will provide helpful error messages to guide you in resolving these issues.

**Solution**: Verify your `XAI_API_KEY` environment variable is set correctly. You can obtain an API key from [https://x.ai/](https://x.ai/).

### Controlling Retries

If you're experiencing timeouts or want to control retry behavior:

- To disable retries for 5XX errors: `PROMPTFOO_RETRY_5XX=false`
- To reduce retry delays: `PROMPTFOO_REQUEST_BACKOFF_MS=1000` (in milliseconds)

## Reference

- [x.ai documentation](https://docs.x.ai/)
