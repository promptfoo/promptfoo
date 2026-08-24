---
title: xAI (Grok) Provider
description: Use xAI Grok models for text, image, video, voice, and Responses API tool workflows, including Grok 4.5, Grok 4.3, regional endpoints, and pricing.
keywords:
  [
    xai,
    grok,
    grok-4.5,
    grok-4.3,
    grok-imagine-image,
    grok-4,
    grok-3,
    reasoning,
    vision,
    llm,
    agentic,
  ]
---

# xAI (Grok)

The `xai` provider supports [xAI's Grok models](https://x.ai/) through an API interface compatible with OpenAI's format, including text, vision, image generation, video generation, and voice workflows.

## Setup

To use xAI's API, set the `XAI_API_KEY` environment variable or specify via `apiKey` in the configuration file.

```sh
export XAI_API_KEY=your_api_key_here
```

When xAI is the selected fallback provider family, Promptfoo can use xAI defaults for grading, suggestions, synthesis, and web search. These automatic defaults currently use `grok-4.3` so they work for both US and EU accounts; select `grok-4.5` explicitly where it is available. xAI does not currently expose a public embeddings or moderation API, so those defaults fall back to OpenAI when xAI is selected. Explicit provider IDs in your config still take precedence.

## Supported Models

The xAI provider includes support for the following model formats. [xAI's public model catalog](https://docs.x.ai/developers/models) currently recommends `grok-4.5` for chat, coding, and agentic workloads; consult the catalog when choosing a new default for a long-lived integration.

:::caution Legacy xAI model aliases

[xAI periodically retires older model slugs](https://docs.x.ai/developers/migration/may-15-retirement) and keeps them working through redirects. As of the May 15, 2026 (12:00 PM PT) retirement, requests to the `grok-4-1-fast`, `grok-4-fast`, `grok-4-0709`, and `grok-3` families redirect to `grok-4.3` and use Grok 4.3 pricing. Requests to `grok-code-fast-1` route to `grok-build-0.1`, while `grok-imagine-image-pro` routes to `grok-imagine-image-quality`. For new configs, use a current canonical model ID directly.

:::

:::caution Grok 4.5 availability

[xAI's Grok 4.5 model page](https://docs.x.ai/developers/grok-4-5) currently says the model is not available to EU API Console users. Until xAI removes that restriction, use `grok-4.3` for configs that must work in the EU.

:::

### Grok 4.5 Models

- `xai:grok-4.5` - Flagship reasoning model for coding, agentic tasks, and knowledge work (500K context, text and image input)
- `xai:grok-4.5-latest` - Alias for the Grok 4.5 family
- `xai:grok-build-latest` - Alias for the Grok 4.5 family (default model in Grok Build)

### Grok 4.3 Models

- `xai:grok-4.3` - General-purpose reasoning model
- `xai:grok-4.3-latest` - Alias for the Grok 4.3 family
- `xai:grok-latest` - Alias for the Grok 4.3 family

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

These legacy IDs remain recognized for backward compatibility and redirect to Grok 4.3:

- `xai:grok-4-1-fast-reasoning` and its `-latest` aliases - Redirect with low reasoning effort
- `xai:grok-4-1-fast-non-reasoning` and its `-latest` aliases - Redirect with reasoning disabled

### Grok Code Fast Models

- `xai:grok-build-0.1` - Canonical Grok Build coding model (256K context)
- `xai:grok-code-fast-1` - Legacy alias that routes to `grok-build-0.1`
- `xai:grok-code-fast` - Alias for `grok-build-0.1`
- `xai:grok-code-fast-1-0825` - Versioned alias for `grok-build-0.1`

### Grok-4 Fast Models

These legacy IDs remain recognized for backward compatibility and redirect to Grok 4.3:

- `xai:grok-4-fast-reasoning` and its aliases - Redirect with low reasoning effort
- `xai:grok-4-fast-non-reasoning` and its aliases - Redirect with reasoning disabled

### Grok-4 Models

- `xai:grok-4-0709`, `xai:grok-4`, and `xai:grok-4-latest` - Legacy IDs that redirect to Grok 4.3 with low reasoning effort

### Grok-3 Models

The `grok-3`, `grok-3-beta`, `grok-3-fast`, and related `-latest` IDs are legacy aliases that redirect to Grok 4.3. Promptfoo also recognizes the older Grok 3 Mini IDs for backward compatibility; verify their availability for your xAI account before relying on them.

### Grok-2 and previous Models

Promptfoo recognizes older `grok-2`, `grok-beta`, and vision IDs for existing configs, but they are not in xAI's current public catalog. Use a current model for new configs and verify legacy availability in the xAI Console.

## Configuration

The provider uses [OpenAI-compatible configuration options](/docs/providers/openai) plus Grok-specific options, subject to the model restrictions below. Example usage:

When xAI returns [`usage.cost_in_usd_ticks`](https://docs.x.ai/developers/cost-tracking), Promptfoo uses that exact billed amount, including cache discounts and request-level pricing adjustments. If ticks are unavailable, Promptfoo falls back to the model's catalog rates. Custom pricing can be set with `cost`, `inputCost`, `outputCost`, and `cacheReadCost` (all per-token rates); explicit overrides take precedence over reported ticks.

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: xai:grok-4.5
    config:
      temperature: 0.7
      reasoning_effort: 'high' # low, medium, or high (grok-4.3 also accepts none)
      apiKey: your_api_key_here # Alternative to XAI_API_KEY
```

### Reasoning Support

Multiple Grok models support reasoning capabilities:

**Grok 4.5**: Flagship reasoning model recommended by xAI's public model catalog. Chat requests can set `reasoning_effort` to `low`, `medium`, or `high` (defaults to `high`); Promptfoo rejects other values locally because xAI cannot disable reasoning for this model. Responses API requests use `reasoning.effort` with the same values.

**Grok 4.3**: General-purpose reasoning model. Chat requests can set `reasoning_effort` to `none`, `low`, `medium`, or `high`; Responses API requests use `reasoning.effort`.

**Grok Code Fast Models**: The `grok-code-fast-1` family are reasoning models optimized for agentic coding workflows. They support:

- Function calling and tool usage
- Web search via `search_parameters`
- Fast inference with built-in reasoning

### Grok 4.5 Specific Behavior

Grok 4.5 is xAI's flagship model for coding, agentic tasks, and knowledge work:

- **500K context window** with text and image input
- **Configurable reasoning**: `reasoning_effort` accepts `low`, `medium`, or `high` (defaults to `high`); `none` is rejected
- **Long-context pricing**: requests with at least 200K input tokens use the higher catalog rate ($4/M input, $1/M cached input, and $12/M output instead of $2/M, $0.50/M, and $6/M); Promptfoo uses the exact billed ticks when xAI returns them
- **Unsupported parameters**: `presence_penalty`, `frequency_penalty`, and `stop` are rejected, and Promptfoo strips them automatically
- **Ignored parameters**: xAI silently ignores `logprobs` and `top_logprobs` on Grok 4.20 and newer models
- **Server-side tools**: use `xai:responses:grok-4.5` for web search, X search, code execution, and MCP

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: xai:grok-4.5
    config:
      temperature: 0.7
      reasoning_effort: medium
      max_completion_tokens: 4096
```

### Grok 4.3 Specific Behavior

Grok 4.3 is a general-purpose alternative for text workflows:

- **Responses API recommended**: Use `xai:responses:grok-4.3` for server-side tools, multi-turn state, and newer xAI capabilities
- **Configurable reasoning**: Set `reasoning_effort` to `none`, `low`, `medium`, or `high`
- **Unsupported parameters**: Same restrictions as other Grok 4-family reasoning models (`presence_penalty`, `frequency_penalty`, and `stop`)

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: xai:grok-4.3
    config:
      temperature: 0.7
      max_completion_tokens: 4096
```

**Grok-3 Models**: Promptfoo retains the legacy Grok 3 Mini reasoning-effort contract for backward compatibility. Use Grok 4.3 or Grok 4.5 for new configurations.

### Grok 4.1 Fast Specific Behavior

These retired IDs redirect to Grok 4.3 but retain their legacy request contract. Promptfoo strips `reasoning_effort`, `presence_penalty`, `frequency_penalty`, and `stop` from these requests. Target Grok 4.3 directly when you need to control reasoning effort.

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: xai:grok-4.3
    config:
      temperature: 0.7
      reasoning_effort: low
      max_completion_tokens: 4096
```

### Grok-4 Fast Specific Behavior

These retired reasoning and non-reasoning IDs redirect to Grok 4.3 but retain their legacy request contract. Use Grok 4.3 directly for new configurations.

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: xai:grok-4.3
    config:
      temperature: 0.7
      reasoning_effort: low
      max_completion_tokens: 4096
```

### Grok-4 Specific Behavior

The retired Grok 4 IDs redirect to Grok 4.3 with low reasoning effort while retaining their legacy request contract. Promptfoo strips unsupported sampling and reasoning-effort parameters; use Grok 4.3 directly for new configurations.

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: xai:grok-4.3
    config:
      temperature: 0.7
      reasoning_effort: low
      max_completion_tokens: 4096
```

### Grok Code Fast Specific Behavior

The Grok Code Fast IDs are aliases of `grok-build-0.1`, xAI's model for agentic coding workflows:

- **Built for Speed**: Designed to be highly responsive for agentic coding tools where multiple tool calls are common
- **Pricing**: $1/1M input tokens, $0.20/1M cached input tokens, and $2/1M output tokens, with higher rates at the long-context tier
- **Reasoning Capabilities**: Built-in reasoning for code analysis, debugging, and problem-solving
- **Tool Integration**: Excellent support for function calling, tool usage, and web search
- **Coding Expertise**: Particularly adept at TypeScript, Python, Java, Rust, C++, and Go

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: xai:grok-build-0.1
    config:
      temperature: 0.1 # Lower temperature often preferred for coding tasks
      max_completion_tokens: 4096
```

### Region Support

You can specify a region to use a region-specific API endpoint:

```yaml
providers:
  - id: xai:grok-4.3
    config:
      region: eu-west-1 # Will use https://eu-west-1.api.x.ai/v1
```

This is equivalent to setting `base_url="https://eu-west-1.api.x.ai/v1"` in the Python client. The same `region` option is also accepted by the xAI image, video, Responses, and realtime voice providers.

xAI's global endpoint automatically routes requests to models available to your team. Regional endpoints are useful for data-residency requirements, but model availability varies by region and account. In particular, xAI currently excludes Grok 4.5 from the EU API Console. Check the xAI Console or the model's xAI documentation before selecting a regional endpoint.

### Live Search (Beta)

:::warning

xAI's current documentation recommends the Responses API for server-side tools. Promptfoo still passes legacy `search_parameters` through for older configs, but new search configs should use the [Agent Tools API](#agent-tools-api-responses-api).

:::

Legacy configs can still pass a `search_parameters` object. The `mode` field controls how search is used:

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

Use the `xai:responses:<model>` provider to access xAI's Agent Tools API, which enables autonomous server-side tool execution for web search, X search, code execution, collections search, and remote MCP tools.

```yaml title="promptfooconfig.yaml"
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

```yaml title="promptfooconfig.yaml"
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

| Parameter              | Type    | Description                                                           |
| ---------------------- | ------- | --------------------------------------------------------------------- |
| `temperature`          | number  | Sampling temperature (0-2)                                            |
| `max_output_tokens`    | number  | Maximum tokens to generate                                            |
| `max_tool_calls`       | number  | Maximum tool calls for one request                                    |
| `top_p`                | number  | Nucleus sampling parameter                                            |
| `tools`                | array   | Agent tools to enable                                                 |
| `tool_choice`          | string  | Tool selection mode: auto, required, none                             |
| `parallel_tool_calls`  | boolean | Allow parallel tool execution                                         |
| `stream`               | boolean | Request streamed response deltas                                      |
| `instructions`         | string  | System-level instructions                                             |
| `previous_response_id` | string  | For multi-turn conversations                                          |
| `store`                | boolean | Store response for later retrieval                                    |
| `include`              | array   | Additional response data to return                                    |
| `reasoning`            | object  | Reasoning configuration for Grok 4.5, Grok 4.3, or multi-agent models |
| `response_format`      | object  | JSON schema for structured output                                     |
| `cost`                 | number  | Per-token input and output cost override                              |
| `inputCost`            | number  | Per-token input cost override                                         |
| `outputCost`           | number  | Per-token output cost override                                        |
| `cacheReadCost`        | number  | Per-token cached-input cost override                                  |

#### Supported Models

The Responses API works with current canonical Grok models, including:

- `grok-4.5` (recommended)
- `grok-4.3`
- `grok-4.20-0309-reasoning`
- `grok-4.20-0309-non-reasoning`
- `grok-4.20-multi-agent-0309`
- `grok-build-0.1`

Retired aliases may still resolve through xAI's documented redirects; use canonical IDs for new configurations.

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

```yaml title="promptfooconfig.yaml"
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

```yaml title="promptfooconfig.yaml"
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

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
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

```yaml title="promptfooconfig.yaml"
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
