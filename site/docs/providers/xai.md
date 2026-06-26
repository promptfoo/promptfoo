---
title: xAI (Grok) Provider
description: Use xAI Grok models for text, image, video, and voice workflows, including Grok 4.3, Grok Imagine, regional endpoints, and Responses API tools.
keywords: [xai, grok, grok-4.3, grok-imagine-image, grok-4, grok-3, reasoning, vision, llm, agentic]
---

# xAI (Grok)

The `xai` provider supports [xAI's Grok models](https://x.ai/) through an API interface compatible with OpenAI's format, including text, vision, image generation, video generation, and voice workflows.

## Setup

To use xAI's API, set the `XAI_API_KEY` environment variable or specify via `apiKey` in the configuration file.

```sh
export XAI_API_KEY=your_api_key_here
```

When xAI is the selected fallback provider family, Promptfoo can use xAI defaults for grading, suggestions, synthesis, and web search. xAI does not expose a public embeddings or moderation API, so those defaults fall back to OpenAI when xAI is selected. Explicit provider IDs in your config still take precedence.

## Supported Models

The xAI provider includes support for the following model formats. xAI's public model catalog recommends `grok-4.3` for general chat and coding workloads; consult the catalog when choosing a new default for a long-lived integration.

:::caution Legacy xAI model aliases

xAI periodically retires older model slugs and keeps them working by redirecting them to newer replacements. As of the May 15, 2026 (12:00 PM PT) retirement, requests to `grok-4-1-fast-reasoning`, `grok-4-1-fast-non-reasoning`, `grok-4-fast-reasoning`, `grok-4-fast-non-reasoning`, `grok-4-0709`, `grok-code-fast-1`, and `grok-3` (including the `*-beta`, `*-fast`, and `*-latest` aliases on each of those families) are redirected to `grok-4.3` — reasoning variants run with `low` reasoning effort, non-reasoning variants run with `none` — and billed at standard Grok 4.3 pricing. The `grok-imagine-image-pro` slug is similarly redirected to xAI's quality image model. For new configs, prefer current catalog models such as `grok-4.3` or `grok-imagine-image-quality` directly.

:::

### Grok 4.3 Models

- `xai:grok-4.3` - General-purpose reasoning model
- `xai:grok-4.3-latest` - Alias for the Grok 4.3 family

### Grok 4.20 Models

- `xai:grok-4.20-0309-reasoning` - Reasoning model
- `xai:grok-4.20` - Alias for the Grok 4.20 reasoning family
- `xai:grok-4.20-reasoning` - Alias for the Grok 4.20 reasoning family
- `xai:grok-4.20-reasoning-latest` - Alias for the Grok 4.20 reasoning family
- `xai:grok-4.20-0309-non-reasoning` - Non-reasoning variant
- `xai:grok-4.20-non-reasoning` - Alias for the Grok 4.20 non-reasoning family
- `xai:grok-4.20-non-reasoning-latest` - Alias for the Grok 4.20 non-reasoning family
- `xai:grok-4.20-multi-agent-0309` - Multi-agent variant
- `xai:grok-4.20-multi-agent` - Alias for the Grok 4.20 multi-agent family
- `xai:grok-4.20-multi-agent-latest` - Alias for the Grok 4.20 multi-agent family

### Grok 4.1 Fast Models

These slugs are retired compatibility aliases that redirect to `grok-4.3`. Use
`xai:grok-4.3` in new configurations.

### Grok Code Fast Models

These slugs are retired compatibility aliases that redirect to `grok-4.3`. Use
`xai:grok-4.3` in new configurations.

### Grok-4 Fast Models

These slugs are retired compatibility aliases that redirect to `grok-4.3`. Use
`xai:grok-4.3` in new configurations.

### Grok-4 Models

These slugs are retired compatibility aliases that redirect to `grok-4.3`. Use
`xai:grok-4.3` in new configurations.

### Grok-3 Models

These slugs are retired compatibility aliases. Use a model from xAI's current catalog.

### Grok-2 and previous Models

These models are retired. Use a model from xAI's current catalog rather than relying on an
older redirect.

## Configuration

The provider supports all [OpenAI provider](/docs/providers/openai) configuration options plus Grok-specific options. Example usage:

Promptfoo uses xAI's model-specific cache-read rate by default. Custom pricing can be set with `cost`, `inputCost`, `outputCost`, and `cacheReadCost` (all per-token rates).

```yaml
providers:
  - id: xai:grok-4.3
    config:
      temperature: 0.7
      reasoning_effort: 'high' # none, low, medium, or high
      apiKey: your_api_key_here # Alternative to XAI_API_KEY
```

### Reasoning Support

Multiple Grok models support reasoning capabilities:

**Grok 4.3**: General-purpose reasoning model recommended by xAI's public model catalog. Chat requests can set `reasoning_effort` to `none`, `low`, `medium`, or `high`; Responses API requests use `reasoning.effort`.

### Grok 4.3 Specific Behavior

Grok 4.3 is a current starting point for general text workflows:

- **Responses API recommended**: Use `xai:responses:grok-4.3` for server-side tools, multi-turn state, and newer xAI capabilities
- **Configurable reasoning**: `reasoning_effort` defaults to xAI's `low` mode; set `none`, `medium`, or `high` when the workload calls for it
- **Unsupported parameters**: Same restrictions as other Grok 4-family reasoning models (`presence_penalty`, `frequency_penalty`, and `stop`)

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: xai:grok-4.3
    config:
      temperature: 0.7
      max_completion_tokens: 4096
```

### Grok 4.1 Fast Specific Behavior

Grok 4.1 Fast is retired. Existing slugs redirect to Grok 4.3; migrate the model ID so the
configuration states what it will actually run.

### Grok-4 Fast Specific Behavior

Grok-4 Fast is retired. Existing slugs redirect to Grok 4.3; migrate the model ID so the
configuration states what it will actually run.

### Grok-4 Specific Behavior

Grok-4 is retired. Existing slugs redirect to Grok 4.3; migrate the model ID so the
configuration states what it will actually run.

### Grok Code Fast Specific Behavior

Grok Code Fast is retired. Existing slugs redirect to Grok 4.3; migrate the model ID so the
configuration states what it will actually run.

### Region Support

You can specify a region to use a region-specific API endpoint:

```yaml
providers:
  - id: xai:grok-4.3
    config:
      region: eu-west-1 # Will use https://eu-west-1.api.x.ai/v1
```

This is equivalent to setting `base_url="https://eu-west-1.api.x.ai/v1"` in the Python client. The same `region` option is also accepted by the xAI image, video, Responses, and realtime voice providers.

xAI's public regional docs say the global endpoint automatically routes requests and gives access to every model available to your team. The public model catalog shows xAI's language, Grok Imagine image, and Grok Imagine video models in both `us-east-1` and `eu-west-1`. Regional endpoints are useful for data-residency requirements, but xAI warns that not every model is guaranteed in every region over time; for region-by-region availability, use the xAI Console or the model pages on xAI's site.

### Live Search (Beta)

:::warning

xAI's documentation recommends the Responses API for server-side tools. Promptfoo still passes legacy `search_parameters` through for older configs, but new search configs should use the [Agent Tools API](#agent-tools-api-responses-api).

:::

Legacy configs can still pass a `search_parameters` object. The `mode` field controls how search is used:

- `off` – Disable search
- `auto` – Model decides when to search (default)
- `on` – Always perform live search

Additional fields like `sources`, `from_date`, `to_date`, and `return_citations` may also be provided.

```yaml
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

Use the `xai:responses:<model>` provider to access xAI's Agent Tools API, which enables autonomous server-side tool execution for web search, X search, code execution, collections search, and remote MCP tools.

```yaml
providers:
  - id: xai:responses:grok-4.3
    config:
      temperature: 0.7
      max_output_tokens: 4096
      tools:
        - type: web_search
        - type: x_search
```

#### Available Agent Tools

| Tool                                  | Description                        |
| ------------------------------------- | ---------------------------------- |
| `web_search`                          | Search the web and browse pages    |
| `x_search`                            | Search X posts, users, and threads |
| `code_execution` / `code_interpreter` | Execute Python code in a sandbox   |
| `collections_search` / `file_search`  | Search uploaded knowledge bases    |
| `mcp`                                 | Connect to remote MCP servers      |

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

```yaml
providers:
  - id: xai:responses:grok-4.3
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

| Parameter              | Type    | Description                                                |
| ---------------------- | ------- | ---------------------------------------------------------- |
| `temperature`          | number  | Sampling temperature (0-2)                                 |
| `max_output_tokens`    | number  | Maximum tokens to generate                                 |
| `max_tool_calls`       | number  | Maximum tool calls for one request                         |
| `top_p`                | number  | Nucleus sampling parameter                                 |
| `tools`                | array   | Agent tools to enable                                      |
| `tool_choice`          | string  | Tool selection mode: auto, required, none                  |
| `parallel_tool_calls`  | boolean | Allow parallel tool execution                              |
| `stream`               | boolean | Request streamed response deltas                           |
| `instructions`         | string  | System-level instructions                                  |
| `previous_response_id` | string  | For multi-turn conversations                               |
| `store`                | boolean | Store response for later retrieval                         |
| `include`              | array   | Additional response data to return                         |
| `reasoning`            | object  | Reasoning configuration for Grok 4.3 or multi-agent models |
| `response_format`      | object  | JSON schema for structured output                          |
| `cost`                 | number  | Per-token input and output cost override                   |
| `inputCost`            | number  | Per-token input cost override                              |
| `outputCost`           | number  | Per-token output cost override                             |
| `cacheReadCost`        | number  | Per-token cached-input cost override                       |

#### Supported Models

The Responses API works with Grok models, including:

- `grok-4.3`
- `grok-4.20-reasoning`
- `grok-4.20-non-reasoning`
- `grok-4.20-multi-agent`

#### Migration from Live Search

If you're using Live Search via `search_parameters`, migrate to the Responses API:

**Before (Live Search - deprecated):**

```yaml
providers:
  - id: xai:grok-4.3
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
  - id: xai:responses:grok-4.3
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

```yaml
providers:
  - id: xai:grok-4.3
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

```yaml
providers:
  - id: xai:grok-4.3
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

```yaml
prompts:
  - file://prompt.yaml

providers:
  - id: xai:grok-4.3

tests:
  - vars:
      image_url: 'https://example.com/image.jpg'
      question: "What's in this image?"
```

### Embeddings

xAI does not currently expose a public embeddings API. Use the [OpenAI provider](/docs/providers/openai) (or another embedding provider) for [similarity assertions](/docs/configuration/expected-outputs/similar).

### Image Generation

xAI also supports image generation through Grok Imagine:

```yaml
providers:
  - xai:image:grok-imagine-image
```

Current Grok Imagine image model IDs include:

- `xai:image:grok-imagine-image`
- `xai:image:grok-imagine-image-quality`
- `xai:image:grok-imagine-image-pro`

`grok-imagine-image-quality` is xAI's newer quality-oriented image model and the better default for new higher-quality image workflows. Older image-model aliases may continue to resolve through xAI-managed redirects.

Example configuration for image generation:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - 'A {{style}} painting of {{subject}}'

providers:
  - id: xai:image:grok-imagine-image
    config:
      n: 1 # Number of images to generate (1-10)
      response_format: 'url' # 'url' or 'b64_json'
      aspect_ratio: '16:9'
      resolution: '2k'

tests:
  - vars:
      style: 'impressionist'
      subject: 'sunset over mountains'
```

#### Image Editing

Use the same provider with `image`, `images`, or `mask` inputs to call xAI's image-editing endpoint:

```yaml
providers:
  - id: xai:image:grok-imagine-image
    config:
      image:
        url: 'https://example.com/source.png'
      mask:
        url: 'https://example.com/mask.png'
      quality: 'high'

prompts:
  - 'Render this as a pencil sketch with detailed shading'
```

#### Pricing

Promptfoo uses the exact `usage.cost_in_usd_ticks` value returned by xAI when available. When the API omits usage, Promptfoo falls back to its local Imagine image estimate, including documented output rates and source-image media-input charges on edit requests.

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
| `reference_images` | array  | -       | Reference images for reference-to-video mode      |
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

#### Reference-to-Video

Guide generation with up to seven reference images:

```yaml
providers:
  - id: xai:video:grok-imagine-video
    config:
      reference_images:
        - url: 'https://example.com/person.jpg'
        - url: 'https://example.com/shirt.jpg'
      duration: 10
```

Reference-to-video requires a non-empty prompt, cannot be combined with `image` or `video`, and is limited to 10 seconds.

#### Pricing

Promptfoo uses the exact `usage.cost_in_usd_ticks` value returned by xAI when available. When the API omits usage, Promptfoo falls back to the video provider's local duration-based estimate.

### Voice Agent API

The xAI Voice Agent API enables real-time voice conversations with Grok models via WebSocket. Use the `xai:voice:<model>` provider format.

```yaml
providers:
  - xai:voice:grok-voice-think-fast-1.0
```

#### Configuration

```yaml
providers:
  - id: xai:voice:grok-voice-think-fast-1.0
    config:
      voice: 'Ara' # Ara, Rex, Sal, Eve, or Leo
      instructions: 'You are a helpful voice assistant.'
      modalities: ['text', 'audio']
      turn_detection:
        type: server_vad
        threshold: 0.85
        silence_duration_ms: 500
        prefix_padding_ms: 333
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

#### Turn Detection

Use `turn_detection` to tune server-side voice activity detection:

| Option                | Type   | Description                                         |
| --------------------- | ------ | --------------------------------------------------- |
| `type`                | string | `server_vad` for automatic detection                |
| `threshold`           | number | Activation threshold from 0.1 to 0.9                |
| `silence_duration_ms` | number | Silence required before ending the turn             |
| `prefix_padding_ms`   | number | Audio kept before detected speech to avoid clipping |

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

```yaml
providers:
  - id: xai:voice:grok-voice-think-fast-1.0
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
  - id: xai:voice:grok-voice-think-fast-1.0
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
  - id: xai:voice:grok-voice-think-fast-1.0
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
  - id: xai:voice:grok-voice-think-fast-1.0
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

For examples demonstrating text generation, image creation, and web search, see the [xai example](https://github.com/promptfoo/promptfoo/tree/main/examples/xai/chat).

```bash
npx promptfoo@latest init --example xai/chat
```

For real-time voice conversations with Grok, see the [xai-voice example](https://github.com/promptfoo/promptfoo/tree/main/examples/xai/voice).

```bash
npx promptfoo@latest init --example xai/voice
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
