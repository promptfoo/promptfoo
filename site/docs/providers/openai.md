---
title: OpenAI
sidebar_position: 1
description: 'Run OpenAI evals with Promptfoo. Choose an API, configure models, test structured output and tools, and use images, audio, caching, and compatible endpoints.'
---

import Link from '@docusaurus/Link';

# OpenAI

Use Promptfoo to compare OpenAI models, test prompts, and check your application's outputs. Start with the Responses API for new text and image-input evals, following [OpenAI's recommendation](https://developers.openai.com/api/docs/guides/migrate-to-responses). Use Chat Completions when that is the API your application calls.

## Quickstart

1. Set `OPENAI_API_KEY` in your shell or secret manager. You can create a key in the [OpenAI dashboard](https://platform.openai.com/api-keys).

   ```sh
   export OPENAI_API_KEY=your_api_key_here
   ```

2. Save this configuration as `promptfooconfig.yaml`:

   ```yaml title="promptfooconfig.yaml"
   prompts:
     - |-
       Classify this support ticket as billing or technical.
       Reply with only the label.
       Ticket: {{ticket}}

   providers:
     - id: openai:responses:gpt-5.6-luna
       config:
         reasoning:
           effort: low
         max_output_tokens: 2048

   tests:
     - vars:
         ticket: I was charged twice for my subscription.
       assert:
         - type: equals
           value: billing
     - vars:
         ticket: The app crashes when I try to sign in.
       assert:
         - type: equals
           value: technical
   ```

3. Run the eval from the directory containing the configuration:

   ```sh
   npx promptfoo@latest eval --no-cache -o results.json
   ```

The expected outputs are `billing` and `technical`. Check the pass/fail results and any provider errors in `results.json`. To compare models, add another entry under `providers`.

If you keep your key in a local `.env` file, add `--env-file .env` to the command. Keep that file out of version control.

## Models

Use an explicit endpoint in each provider ID. This makes the request format predictable, including for newly released models.

| Task                                   | Provider ID                                | Guide                                                                    |
| -------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| Text, image inputs, and built-in tools | `openai:responses:<model>`                 | [Responses API](#responses-api)                                          |
| Chat Completions                       | `openai:chat:<model>`                      | [Parameters](#configuring-parameters)                                    |
| Embeddings                             | `openai:embedding:<model>`                 | [Embedding dimensions](#reducing-embedding-dimensions)                   |
| Moderation                             | `openai:moderation:omni-moderation-latest` | [Moderation assertions](/docs/configuration/expected-outputs/moderation) |
| Image generation                       | `openai:image:<model>`                     | [Images](#images)                                                        |
| Audio input and output                 | `openai:chat:gpt-audio-1.5`                | [Audio](#audio-capabilities)                                             |
| Text to speech                         | `openai:tts:gpt-4o-mini-tts`               | [Text to speech](#text-to-speech)                                        |
| Conversational Realtime                | `openai:realtime:gpt-realtime-2.1`         | [Realtime](#realtime-api-models)                                         |

For file transcription, see the [current provider limitations](#audio-transcription). For Agents SDK, ChatKit, and Codex workflows, see [agent providers](#agentic-providers).

<Link id="gpt-51" />
<Link id="available-models" />
<Link id="key-features" />
<Link id="usage-examples-1" />
<Link id="reasoning-modes" />
<Link id="migration-from-gpt-5" />
<Link id="key-capabilities" />
<Link id="usage-examples-2" />
<Link id="reasoning-effort-levels" />
<Link id="best-practices" />
<Link id="gpt-52" />
<Link id="available-models-1" />
<Link id="key-specifications" />
<Link id="usage-examples-3" />
<Link id="key-improvements-over-gpt-51" />
<Link id="reasoning-effort-levels-1" />
<Link id="gpt-53-instant" />
<Link id="available-models-2" />
<Link id="key-specifications-1" />
<Link id="usage-examples-4" />
<Link id="gpt-56-limited-preview" />
<Link id="gpt-55" />
<Link id="available-models-3" />
<Link id="key-specifications-2" />
<Link id="usage-examples-5" />
<Link id="gpt-54" />
<Link id="available-models-4" />
<Link id="key-specifications-3" />
<Link id="usage-examples-6" />

Choose a model you can access, then test it with representative inputs. [OpenAI's model catalog](https://developers.openai.com/api/docs/models) lists current availability, capabilities, and limits. The main text-model choices are:

| Model           | Starting point for                            |
| --------------- | --------------------------------------------- |
| `gpt-5.6-luna`  | Simple tasks and high-volume evals            |
| `gpt-5.6-terra` | Balancing capability and cost                 |
| `gpt-5.6-sol`   | Complex tasks                                 |
| `gpt-6-astra`   | The most demanding reasoning and coding tasks |

Check [OpenAI pricing](https://developers.openai.com/api/docs/pricing) before a large run. Model access and API billing belong to your OpenAI account.

<details>
<summary>Aliases, snapshots, and default models</summary>

Bare `openai:<model>` IDs default to Responses for GPT-5.6 and newer GPT models, including named variants and dated snapshots. For example, `openai:gpt-5.6`, `openai:gpt-5.6-luna`, and `openai:gpt-6-astra` all use Responses. Older recognized models keep their model-specific routing; other unknown names fall back to Chat Completions.

Use `openai:chat:<model>` or `openai:responses:<model>` to select the endpoint explicitly, including for a compatible gateway. Existing bare GPT-5.6 configurations with Chat-specific options should either select `openai:chat:gpt-5.6` or switch to Responses options such as `reasoning.effort` and `max_output_tokens`.

Bare `openai:chat` and `openai:responses` currently select `gpt-4.1-2025-04-14`. Specify a model ID, such as `openai:responses:gpt-5.6-luna`, to choose a newer model explicitly. Keeping the existing defaults avoids changing the model for configurations that omit it. When a model has dated snapshots, use one to hold the model version constant across runs. A fixed snapshot does not guarantee identical outputs.

`openai:embedding` and `openai:embeddings` default to `text-embedding-3-large`; both prefixes accept an explicit model. `openai:speech:` is an alias for `openai:tts:`.

</details>

### GPT-5.6

The `gpt-5.6` model alias selects Sol. Sol, Terra, and Luna support Chat Completions and Responses. In Responses, use `reasoning.effort` to set the reasoning budget and `reasoning.mode: pro` for Pro mode:

```yaml
providers:
  - id: openai:responses:gpt-5.6-sol
    config:
      reasoning:
        effort: high
        mode: pro
      max_output_tokens: 8192
```

Accepted reasoning efforts vary by model. See the [model catalog](https://developers.openai.com/api/docs/models) before changing them. Codex's `ultra` setting is not a Responses API reasoning effort.

### GPT-6 Astra

Use `openai:responses:gpt-6-astra` for Astra evals with tools. Explicit `openai:chat:gpt-6-astra` supports text generation, but Astra tool calling requires Responses.

Astra accepts `low`, `medium`, `high`, `xhigh`, and `max` reasoning effort. It does not accept `none` or `minimal`. Promptfoo removes unsupported sampling and log-probability parameters for Astra. See the [Astra model guide](https://developers.openai.com/api/docs/models/gpt-6-astra).

### Fine-tuned models {#fine-tuned-and-legacy-completion-models}

Use the full fine-tuned model ID with its supported endpoint:

```yaml
providers:
  - openai:chat:ft:gpt-4.1-mini-2025-04-14:company-name:ticket-classifier:MODEL_ID
```

Replace the example ID with your model's ID. Inference availability follows the base model's lifecycle; training access has separate restrictions. See [OpenAI's fine-tuning lifecycle](https://developers.openai.com/api/docs/deprecations#update-to-openais-self-serve-fine-tuning).

## Chat messages {#formatting-chat-messages}

A plain text prompt becomes a user message. For system instructions, conversation history, or multimodal inputs, use a JSON message array in a prompt file. See [chat threads](/docs/configuration/chat).

Chat Completions and Responses use different multimodal content blocks. Use the formats in [image inputs](#sending-images-in-prompts) and [audio inputs](#using-audio-inputs) for your endpoint.

## Parameters {#configuring-parameters}

<Link id="reasoning-models-o1-o3-o3-pro-o3-mini-o4-mini" />
<Link id="how-reasoning-models-work" />
<Link id="reasoning-models" />
<Link id="o3-and-o4-mini-models" />
<Link id="o3-and-o4-mini" />

Put model options under the provider's `config`. Match the options to the endpoint and model:

| Setting                           | Chat Completions                          | Responses                                   |
| --------------------------------- | ----------------------------------------- | ------------------------------------------- |
| Output limit for reasoning models | `max_completion_tokens`                   | `max_output_tokens`                         |
| Reasoning effort                  | `reasoning_effort: low`                   | `reasoning: { effort: low }`                |
| Verbosity on supported models     | `verbosity: low`                          | `verbosity: low` (sent as `text.verbosity`) |
| Structured output                 | `response_format`                         | `response_format` (sent as `text.format`)   |
| System instructions               | System or developer message in the prompt | `instructions` or messages in the prompt    |

```yaml
providers:
  - id: openai:chat:gpt-5.6-luna
    config:
      reasoning_effort: low
      max_completion_tokens: 2048
  - id: openai:responses:gpt-5.6-luna
    config:
      reasoning:
        effort: low
      max_output_tokens: 2048
```

Reasoning tokens count toward the output limit and billing, even though they are not the visible answer. Leave enough room for both reasoning and the final output.

<Link id="gpt-41" />
<Link id="usage-examples" />

Promptfoo omits `temperature` for models it recognizes as reasoning models, including GPT-5, Astra, and o-series models. For a non-reasoning model such as `gpt-4.1-mini`, you can set `temperature: 0` and, on Chat Completions, `max_tokens`. Check the selected model's API documentation before using other sampling options.

<details>
<summary>Defaults and additional request options</summary>

For non-reasoning requests, Promptfoo defaults to `temperature: 0` and an output limit of 1,024 tokens. For reasoning requests, Promptfoo leaves the output limit unset unless you configure it or set an applicable environment variable. Set the limit explicitly when comparing models.

`omitDefaults: true` omits Promptfoo's default temperature and output limit. Explicit configuration and environment values still apply.

| Option                                     | Use                                                                                                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools`, `tool_choice`                     | Declare tools and control tool selection. See [tool calling](#tool-calling).                                                                                          |
| `functionToolCallbacks`                    | Map function names to local callbacks. See [callbacks](#automatically-handling-function-tool-calls).                                                                  |
| `passthrough`                              | Add fields directly to the request body, or override generated fields. Model-specific validation still applies. Supported by Chat, Responses, embeddings, and speech. |
| `prompt_cache_key`, `prompt_cache_options` | Configure [OpenAI prompt caching](#prompt-caching-and-included-tool-results).                                                                                         |
| `service_tier`                             | Request a service tier supported by your model and account.                                                                                                           |
| `maxRetries`                               | Retry count for HTTP requests; defaults to 4. Set to 0 to disable retries. Hard quota failures are not retried.                                                       |

For endpoint-specific fields, see the [Chat Completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) and [Responses reference](https://developers.openai.com/api/reference/resources/responses/methods/create). Promptfoo's [configuration types](https://github.com/promptfoo/promptfoo/blob/main/src/providers/openai/types.ts) describe the named provider options. An API field without a named option may need `passthrough`.

</details>

### Connection settings

<Link id="using-with-azure" />

The default base URL is `https://api.openai.com/v1`. Set `apiBaseUrl` for an OpenAI-compatible gateway and `apiKeyEnvar` to select its credential:

```yaml
providers:
  - id: openai:chat:your-model
    config:
      apiBaseUrl: https://gateway.example.com/v1
      apiKeyEnvar: GATEWAY_API_KEY
      omitDefaults: true
```

Use the model name and endpoint supported by your gateway. `apiBaseUrl` includes the API prefix, such as `/v1`, but not `/chat/completions` or `/responses`. Promptfoo appends the endpoint path and preserves base URL query parameters.

| Option           | Use                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `apiKeyEnvar`    | Read a key from the named environment variable. A missing variable does not fall back to `OPENAI_API_KEY`. |
| `apiKey`         | Set a key directly; takes precedence over environment variables. Prefer a secret-backed value.             |
| `apiKeyRequired` | Set to `false` only for endpoints that do not require an API key.                                          |
| `headers`        | Add request headers, such as `OpenAI-Project`.                                                             |
| `organization`   | Set the OpenAI organization ID.                                                                            |

Provider `env` overrides take precedence over the corresponding process environment variables. For [Azure OpenAI](/docs/providers/azure/), use the Azure provider and its deployment-specific configuration.

<details>
<summary>Base URL precedence and attribution headers</summary>

Promptfoo checks `config.apiHost`, then `config.apiBaseUrl`, then the endpoint environment variables listed [below](#supported-environment-variables). `apiHost` constructs `https://<host>/v1`; use `apiBaseUrl` when you need a protocol, port, or custom path.

Built-in OpenAI API requests include `X-OpenAI-Originator: promptfoo`. Override that value with `config.headers` if your integration needs a different originator. Custom headers also override the configured organization header.

</details>

### Cost estimates

Promptfoo uses returned token usage and its model pricing catalog to estimate costs. Estimates can be incomplete for new models, tools, or gateways that omit usage. Check [OpenAI's usage dashboard](https://platform.openai.com/usage) for billed usage.

For Chat Completions and Responses, set `inputCost` and `outputCost` to override rates in **dollars per token**, not per million tokens. For audio, use `audioInputCost` and `audioOutputCost`. The older `cost` and `audioCost` options are shared input/output fallbacks. These settings affect Promptfoo's estimates, not API billing.

### Generating multiple responses

For Chat Completions models that support `n`, pass it through to the API:

```yaml
providers:
  - id: openai:chat:gpt-4.1-mini
    config:
      passthrough:
        n: 3
```

Promptfoo's primary `output` contains the first choice. The provider response's `metadata.choices` contains all choices. The Responses API does not use `n`.

### Reducing embedding dimensions

Set `dimensions` through `passthrough` for a `text-embedding-3` model:

```yaml
providers:
  - id: openai:embedding:text-embedding-3-large
    config:
      passthrough:
        dimensions: 1024
```

When grading generated text with embeddings, configure the embedding provider on the [similarity assertion](/docs/configuration/expected-outputs/similar/). See the [Embeddings API reference](https://developers.openai.com/api/reference/resources/embeddings/methods/create) for model limits.

## Responses API

{/* Preserve existing links to consolidated sections. */}
<Link id="supported-responses-models" />
<Link id="using-the-responses-api" />
<Link id="advanced-configuration" />
<Link id="best-practices-2" />
<Link id="complete-example-1" />

Use `openai:responses:<model>` for text, image and file inputs, built-in tools, and response state. A basic configuration is:

```yaml
providers:
  - id: openai:responses:gpt-5.6-luna
    config:
      instructions: Answer support questions using the supplied policy.
      reasoning:
        effort: low
      max_output_tokens: 2048
      store: false
```

`store: false` controls storage at OpenAI. It does not disable Promptfoo's local response cache. Use `--no-cache` when you need fresh API requests. OpenAI's [data controls](https://developers.openai.com/api/docs/guides/your-data) describe retention and account-level restrictions.

### Response state and streaming {#responses-specific-configuration-options}

<details>
<summary>State, tools, storage, and streaming</summary>

| Option                 | Behavior                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `instructions`         | Set system instructions for this request.                                                                     |
| `previous_response_id` | Continue a stored response by ID. It does not automatically connect separate test cases.                      |
| `store`                | Control storage for later retrieval. OpenAI's default is `true`; account data controls can restrict it.       |
| `include`              | Request extra fields in the raw response, such as `web_search_call.results` or `reasoning.encrypted_content`. |
| `max_tool_calls`       | Limit built-in tool calls in one response.                                                                    |
| `parallel_tool_calls`  | Allow parallel tool calls where supported.                                                                    |
| `metadata`             | Attach string key/value metadata.                                                                             |
| `truncation`           | Use `disabled` to fail on excess context, or `auto` to let OpenAI truncate it.                                |
| `background`           | Create a background response; Promptfoo polls until it completes or times out.                                |
| `stream`               | Request streaming; Promptfoo collects the stream into the eval result.                                        |

The provider response's `raw` field contains the Responses object, including `id` and `output` items. Its `metadata` includes extracted annotations and HTTP metadata. Use these fields when you need to inspect tool results or continue a conversation.

</details>

### Prompt caching {#prompt-caching-and-included-tool-results}

OpenAI prompt caching reuses a shared input prefix while still generating a new response. Promptfoo's local cache reuses the response itself. `--no-cache` bypasses Promptfoo's cache; it does not disable OpenAI prompt caching.

For GPT-5.6 and Astra, configure `prompt_cache_options`:

```yaml
providers:
  - id: openai:responses:gpt-5.6-luna
    config:
      prompt_cache_key: support-policy
      prompt_cache_options:
        mode: implicit
        ttl: 30m
```

`implicit` lets OpenAI place cache breakpoints. With `explicit`, add `prompt_cache_breakpoint: { mode: explicit }` to eligible structured content blocks; without a breakpoint, explicit mode performs no cache reads or writes. See [OpenAI's prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching) for eligible inputs and billing.

<details>
<summary>Earlier models and background requests</summary>

Earlier models use `prompt_cache_retention` where supported. GPT-5.5 Responses requires extended retention; `in_memory` is invalid for that model. GPT-5.6 and later deprecate this field in favor of `prompt_cache_options.ttl`.

Authenticated background jobs are persisted for resumption only when a non-secret project or tenant header, such as `OpenAI-Project` or `X-Tenant-Id`, isolates the request. `OpenAI-Organization` alone does not isolate projects. A persisted job may be shared by eval processes, so stopping one subscriber does not cancel it for the others. Use `--no-cache` for a run whose upstream background job should be cancelled when the eval stops.

</details>

## Structured output {#using-response_format}

{/* Preserve existing links to consolidated sections. */}
<Link id="prompt-config-example" />
<Link id="provider-config-example" />
<Link id="per-test-structured-output" />

<Link id="response-format" />

Use a JSON schema when assertions need specific fields. Promptfoo accepts `response_format` in both Chat Completions and Responses configurations and translates it to the selected API's format.

```yaml title="promptfooconfig.yaml"
prompts:
  - 'Classify this support ticket: {{ticket}}'

providers:
  - id: openai:responses:gpt-5.6-luna
    config:
      reasoning:
        effort: low
      max_output_tokens: 2048
      response_format:
        type: json_schema
        json_schema:
          name: ticket_category
          strict: true
          schema:
            type: object
            properties:
              category:
                type: string
                enum: [billing, technical]
            required: [category]
            additionalProperties: false

tests:
  - vars:
      ticket: I was charged twice for my subscription.
    assert:
      - type: javascript
        value: output.category === 'billing'
```

Promptfoo parses valid JSON schema output into an object, so the assertion can read `output.category` directly. Refusals, incomplete responses, or invalid JSON may still produce a different output; check errors and failed assertions. For JSON mode without a schema, use `type: json_object` and explicitly ask for JSON in the prompt.

### External file references

For either endpoint, `response_format` can reference a JSON or YAML file containing the entire format configuration:

```yaml
config:
  response_format: file://./response-format.json
```

Use the nested `json_schema` shape above for Chat Completions or a shared configuration. Responses also accepts the flattened shape below and always sends JSON schemas with `strict: true`:

```json title="response-format.json"
{
  "type": "json_schema",
  "name": "ticket_category",
  "schema": {
    "type": "object",
    "properties": {
      "category": { "type": "string", "enum": ["billing", "technical"] }
    },
    "required": ["category"],
    "additionalProperties": false
  }
}
```

The schema itself can be a nested `file://` reference. File paths support Nunjucks variables, such as `file://./schemas/{{ schema_name }}.json`.

<details>
<summary>Prompt-level and per-test formats</summary>

A prompt's `config.response_format` overrides the provider setting. For a different schema per test, set `tests[].options.response_format`. See the [per-test schema example](https://github.com/promptfoo/promptfoo/blob/main/examples/openai-structured-output/per-test-schema.yaml).

For complete configurations, see the [structured output example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-structured-output) and [Responses external format example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-responses).

</details>

## Tool calling

<Link id="function-calling" />

Use tools to test which function the model selects and which arguments it produces. A tool definition alone does not execute your application code.

### Using tools

Chat Completions nests each function definition under `function`. This eval forces an order lookup and validates both the schema and the requested order ID:

```yaml title="promptfooconfig.yaml"
prompts:
  - 'Look up order {{order_id}}.'

providers:
  - id: openai:chat:gpt-4.1-mini
    // highlight-start
    config:
      tools:
        - type: function
          function:
            name: get_order_status
            description: Get the status of an order by ID.
            strict: true
            parameters:
              type: object
              properties:
                order_id:
                  type: string
              required: [order_id]
              additionalProperties: false
      tool_choice:
        type: function
        function:
          name: get_order_status
    // highlight-end

tests:
  - vars:
      order_id: ORD-123
    assert:
      - type: is-valid-openai-tools-call
      - type: javascript
        value: |-
          const calls = Array.isArray(output) ? output : output.tool_calls;
          return calls.length === 1 &&
            calls[0].function.name === 'get_order_status' &&
            JSON.parse(calls[0].function.arguments).order_id === context.vars.order_id;
```

The [`is-valid-openai-tools-call` assertion](/docs/configuration/expected-outputs/deterministic/#is-valid-openai-tools-call) checks Chat-style tool calls against the configured schema. The JavaScript assertion checks the intended behavior.

<details>
<summary>Responses tool definitions and results</summary>

Responses uses top-level function fields:

```yaml
config:
  tools:
    - type: function
      name: get_order_status
      description: Get the status of an order by ID.
      strict: true
      parameters:
        type: object
        properties:
          order_id:
            type: string
        required: [order_id]
        additionalProperties: false
  tool_choice:
    type: function
    name: get_order_status
```

Promptfoo also converts nested Chat-style definitions to the Responses shape. Responses function-call results are available in `raw.output` as items with `type: function_call`, `name`, `arguments`, and `call_id`. Inspect those items when asserting on native Responses tool calls; they are not Chat-style `output[0].function` objects.

</details>

### Loading tools from a file {#loading-toolsfunctions-from-a-file}

Set `config.tools` to a file reference. Static files contain an array of tool definitions:

```yaml
config:
  tools: file://./tools.yaml
```

For dynamic definitions, export a function that returns the array and include its name: `file://./tools.ts:getTools`, `file://./tools.js:getTools`, or `file://./tools.py:get_tools`. Both synchronous and asynchronous functions are supported.

Inline tool definitions and file-reference paths can use test variables. Promptfoo does not render placeholders inside the loaded file or returned tool definitions; supply those values in the file or function itself.

### Run tool callbacks {#automatically-handling-function-tool-calls}

For Chat Completions and Responses, `functionToolCallbacks` maps tool names to local functions. A callback receives the arguments as a JSON string and should return a string or `Promise<string>`.

These providers return callback results as eval output; they do not run a general model-to-tool loop that sends every result back to the model. To evaluate a complete agent loop, use the [Agents SDK provider](/docs/providers/openai-agents) or a [custom provider](/docs/providers/custom-api/).

<details>
<summary>Use a local callback in a YAML configuration</summary>

Add a callback to a provider that defines `get_order_status`:

```yaml
config:
  functionToolCallbacks:
    get_order_status: file://./callbacks.mjs:getOrderStatus
```

For a deterministic test, this callback returns a fixed fixture:

```js title="callbacks.mjs"
export function getOrderStatus(args) {
  const { order_id } = JSON.parse(args);
  return JSON.stringify({ order_id, status: 'shipped' });
}
```

Keep callback files inside the configuration's base directory. Promptfoo rejects callback paths that escape it. Only run configurations and callbacks you trust.

</details>

## Web search {#web-search-support}

{/* Preserve existing links to consolidated sections. */}
<Link id="enabling-web-search" />
<Link id="using-web-search-assertions" />
<Link id="cost-considerations" />
<Link id="best-practices-1" />

Add OpenAI's `web_search` tool to a Responses provider:

```yaml
providers:
  - id: openai:responses:gpt-5.6-luna
    config:
      tools:
        - type: web_search
          search_context_size: low
          filters:
            allowed_domains: [developers.openai.com]
      include:
        - web_search_call.results
```

This example limits searches to OpenAI's developer documentation. Tool options are forwarded to OpenAI, including `search_context_size`, `filters`, `user_location`, `external_web_access`, and `return_token_budget`. See the [web search guide](https://developers.openai.com/api/docs/guides/tools-web-search) for supported values and model restrictions.

<details>
<summary>Location, live access, and search budgets</summary>

For location-sensitive searches, add an approximate location to the tool:

```yaml
tools:
  - type: web_search
    search_context_size: medium
    user_location:
      type: approximate
      country: US
      city: San Francisco
      region: California
      timezone: America/Los_Angeles
    external_web_access: true
```

`search_context_size` accepts `low`, `medium`, or `high`. Set `external_web_access: false` to use cached or indexed results without fetching live pages. For longer research with GPT-5+ reasoning models, `return_token_budget: unlimited` removes the standard search-result token cap; `default` keeps it. Removing the cap can increase latency and cost. The budget option applies to `web_search`, not `web_search_preview`.

</details>

Inspect citations in the provider response's `metadata.annotations` and search items in `raw.output`. Use `--no-cache` for fresh searches. Web search can incur tool charges in addition to token usage; see [OpenAI pricing](https://developers.openai.com/api/docs/pricing).

The [`search-rubric` assertion](/docs/configuration/expected-outputs/model-graded/search-rubric) uses a search-enabled grading model to verify an output against current information. Configuring the target's search tools and configuring a search-based grader are separate choices.

### MCP tools {#mcp-model-context-protocol-support}

Choose the integration based on what you want to test:

| Task                                                                   | Configuration                                                              |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Let OpenAI call a remote MCP server                                    | Responses with `config.tools` containing `type: mcp`, as below             |
| Connect Promptfoo to a local or remote MCP server for model tool calls | Explicit `openai:chat:<model>` with [`config.mcp`](/docs/integrations/mcp) |
| Evaluate an MCP server's tools directly                                | The [MCP provider](/docs/providers/mcp), without an OpenAI model           |

With `config.mcp`, Promptfoo connects to the server and executes the model's tool calls. This works with servers on your machine or private network. With a Responses `type: mcp` tool, OpenAI connects to the server, so it must be reachable from OpenAI.

<details>
<summary>Connect Promptfoo to an MCP server</summary>

Use an explicit Chat provider, even for models whose bare IDs default to Responses:

```yaml
providers:
  - id: openai:chat:gpt-5.6-luna
    config:
      mcp:
        enabled: true
        server:
          url: http://localhost:8000/mcp
```

Start your MCP server at the configured URL before running the eval. To launch a local server process instead, use `server.command` and `server.args`. See the [MCP integration guide](/docs/integrations/mcp) for authentication and multiple servers.

The Chat provider returns executed tool results as eval output. For a full agent loop that sends results back to the model, use the [Agents SDK provider](/docs/providers/openai-agents) or a [custom provider](/docs/providers/custom-api/).

</details>

<Link id="basic-mcp-configuration" />
<Link id="mcp-tool-configuration-options" />
<Link id="authentication-with-mcp-servers" />
<Link id="filtering-mcp-tools" />
<Link id="approval-settings" />
<Link id="complete-mcp-example" />

For a remote MCP server, add a tool with `type: mcp`. OpenAI connects to that server. This example limits access to one public documentation tool and skips approval only for that tool:

```yaml
providers:
  - id: openai:responses:gpt-5.6-luna
    config:
      tools:
        - type: mcp
          server_label: deepwiki
          server_url: https://mcp.deepwiki.com/mcp
          allowed_tools: [ask_question]
          require_approval:
            never:
              tool_names: [ask_question]
```

Use `headers` inside the MCP tool for authentication, with secret values supplied through environment variables. Approval requests appear in the output; this provider does not interactively approve them. Configure approvals deliberately for automated evals. See [OpenAI's MCP guide](https://developers.openai.com/api/docs/guides/tools-connectors-mcp#approvals) and the [Promptfoo MCP example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-mcp).

## Images

### Sending images in prompts

<Link id="sending-images-in-prompts-1" />

For Responses, use `input_text` and `input_image` blocks. Save this as `image-prompt.json`, reference it with `prompts: [file://image-prompt.json]`, and supply `question` and `image_url` test variables:

```json title="image-prompt.json"
[
  {
    "role": "user",
    "content": [
      { "type": "input_text", "text": "{{question}}" },
      { "type": "input_image", "image_url": "{{image_url}}" }
    ]
  }
]
```

Use a publicly accessible image URL or a base64 data URL. For file inputs, Responses accepts `input_file` blocks with a file ID or supported file data; see the [OpenAI file input guide](https://developers.openai.com/api/docs/guides/file-inputs).

<details>
<summary>Chat Completions image format</summary>

Chat Completions uses `text` and `image_url`, with the URL nested inside an object:

```json title="chat-image-prompt.json"
[
  {
    "role": "user",
    "content": [
      { "type": "text", "text": "{{question}}" },
      { "type": "image_url", "image_url": { "url": "{{image_url}}" } }
    ]
  }
]
```

See the [OpenAI vision example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-vision).

</details>

### Generating images

<Link id="gpt-image-2" />
<Link id="gpt-image-15" />
<Link id="gpt-image-1" />
<Link id="gpt-image-1-mini" />
<Link id="example" />

`openai:image:gpt-image-2` calls `/v1/images/generations` for text-to-image evals:

```yaml title="promptfooconfig.yaml"
prompts:
  - 'A product photo of {{product}} on a plain white background.'

providers:
  - id: openai:image:gpt-image-2
    config:
      size: 1024x1024
      quality: low
      output_format: webp

tests:
  - vars:
      product: a blue ceramic mug
```

This provider supports generation only. Image editing, masks, reference images, variations, and streaming are not implemented. It does not yet recognize OpenAI's GPT Image 2.5 models; use a [custom provider](/docs/providers/custom-api/) to evaluate those models with the current [Image API](https://developers.openai.com/api/docs/guides/image-generation).

<details>
<summary>GPT Image 2 options</summary>

| Option               | Values                                                                 |
| -------------------- | ---------------------------------------------------------------------- |
| `size`               | `auto`, standard sizes such as `1024x1024`, or valid custom dimensions |
| `quality`            | `low`, `medium`, `high`, `auto`                                        |
| `background`         | `opaque`, `auto`; transparency is unsupported for this model           |
| `output_format`      | `png`, `jpeg`, `webp`                                                  |
| `output_compression` | 0 to 100; only with `jpeg` or `webp`                                   |
| `moderation`         | `auto`, `low`                                                          |
| `n`                  | 1 to 10 images                                                         |

Custom dimensions must be multiples of 16, with a maximum edge of 3,840 pixels, an aspect ratio no greater than 3:1, and 655,360 to 8,294,400 total pixels. Promptfoo validates these constraints before sending the request.

Cost estimates may be absent for `quality: auto` or custom sizes. Returned usage remains available for inspection. See the [image example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-images) and [OpenAI image guide](https://developers.openai.com/api/docs/guides/image-generation).

</details>

## Audio {#audio-capabilities}

{/* Preserve existing links to consolidated sections. */}
<Link id="audio-configuration-options" />

Choose the route for your task: `openai:chat:gpt-audio-1.5` for audio input or output in a chat request, [text to speech](#text-to-speech) for reading supplied text aloud, or [Realtime](#realtime-api-models) for conversational sessions. The Responses provider does not support this audio-chat format.

### Using audio inputs

Chat audio inputs use base64-encoded WAV or MP3 data:

```json title="audio-input.json"
[
  {
    "role": "user",
    "content": [
      { "type": "text", "text": "Summarize the customer's request." },
      {
        "type": "input_audio",
        "input_audio": { "data": "{{audio_file}}", "format": "mp3" }
      }
    ]
  }
]
```

Supply your own audio fixture; a `file://` test variable loads its base64 content:

```yaml
prompts:
  - file://audio-input.json

providers:
  - id: openai:chat:gpt-audio-1.5
    config:
      modalities: [text]

tests:
  - vars:
      audio_file: file://assets/customer-request.mp3
```

For spoken responses, use `modalities: [text, audio]` and configure `audio.voice` and `audio.format`:

```yaml
config:
  modalities: [text, audio]
  audio:
    voice: alloy
    format: wav
```

The web viewer displays audio outputs with a player and transcript. See the [audio example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-audio) and [OpenAI audio guide](https://developers.openai.com/api/docs/guides/audio) for supported voices and output formats.

### Text-to-speech

Use `openai:tts:gpt-4o-mini-tts` to turn the prompt into speech:

```yaml title="promptfooconfig.yaml"
prompts:
  - Your order has shipped and will arrive tomorrow.

providers:
  - id: openai:tts:gpt-4o-mini-tts
    config:
      voice: coral
      instructions: Speak warmly and clearly.
      response_format: wav
      speed: 1.0
```

`response_format` supports `mp3`, `opus`, `aac`, `flac`, `wav`, and `pcm`. `speed` ranges from 0.25 to 4.0. Speech input is limited to 4,096 characters. See the [OpenAI text-to-speech guide](https://developers.openai.com/api/docs/guides/text-to-speech).

<details>
<summary>Speech formats, custom voices, and caching</summary>

`format` is an alias for `response_format`; the explicit `response_format` wins if both are set. Use `passthrough` for speech request fields without a dedicated provider option.

Custom voices use `voice: { id: voice_123 }` and require access to that voice in your OpenAI project. To cache a custom-voice response, set a non-secret project or tenant header such as `OpenAI-Project`. `OpenAI-Organization` alone does not isolate projects.

On `api.openai.com`, secret authentication headers are excluded from the cache key; non-secret project or tenant headers keep cached results separate. Rotating an authentication secret alone does not invalidate that cache. Authenticated custom endpoints bypass persistent caching, even with a tenant header. Caching also skips requests with detected secrets in the body, URL path, or non-authentication header values.

The binary GPT-4o mini TTS response does not provide token usage, so Promptfoo leaves its cost unset.

</details>

### Audio transcription

<Link id="transcription-configuration-options" />
<Link id="diarization-example" />

OpenAI recommends `gpt-transcribe` for files and `gpt-live-transcribe` for live audio. The built-in `openai:transcription:*` provider still uses the older model-specific request formats: it sends `verbose_json` for an unrecognized model and does not expose the new `languages` or `keywords` fields. Changing its model ID alone is not a supported migration to these models.

For a new transcription integration, wrap OpenAI's current SDK request in a [custom provider](/docs/providers/custom-api/) and follow the [OpenAI transcription guide](https://developers.openai.com/api/docs/guides/transcription). Existing Whisper and GPT-4o transcription users should check the [deprecation schedule](https://developers.openai.com/api/docs/deprecations#2026-08-26-transcription-models).

## Realtime {#realtime-api-models}

{/* Preserve existing links to consolidated sections. */}
<Link id="supported-realtime-models" />
<Link id="using-realtime-api" />
<Link id="function-calling-with-realtime-api" />
<Link id="complete-example" />
<Link id="input-and-message-format" />
<Link id="multi-turn-conversations" />

Use `openai:realtime:gpt-realtime-2.1` for a conversational WebSocket session. Choose a text-only output mode when your eval does not need generated audio:

```yaml title="promptfooconfig.yaml"
prompts:
  - Explain how to reset a password in one sentence.

providers:
  - id: openai:realtime:gpt-realtime-2.1
    config:
      modalities: [text]
      websocketTimeout: 60000
```

For audio output, set `modalities: [text, audio]` and a top-level `voice`, such as `marin`. Promptfoo sends the current Realtime API schema; if the requested modalities include audio, it selects audio output with a transcript.

The result includes audio for playback and a transcript for text assertions. The built-in `llm-rubric` assertion grades the transcript; it does not automatically send the generated audio to the grader. Grading voice quality or other acoustic properties requires a custom grading integration.

### Session settings {#realtime-specific-configuration-options}

<details>
<summary>Session, audio, and tool settings</summary>

| Option                                      | Behavior                                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `instructions`                              | System instructions for the session                                                            |
| `voice`                                     | Audio output voice; defaults to `alloy`                                                        |
| `input_audio_format`, `output_audio_format` | `pcm16`, `g711_ulaw`, or `g711_alaw`                                                           |
| `input_audio_transcription`                 | Input transcription settings for a model supported by the Realtime API                         |
| `turn_detection`                            | `server_vad`, `semantic_vad`, or `null`                                                        |
| `reasoning`                                 | Model-specific reasoning settings                                                              |
| `max_response_output_tokens`                | Integer from 1 to 4,096, or `'inf'` for the model maximum; invalid values fall back to `'inf'` |
| `websocketTimeout`                          | Timeout in milliseconds; defaults to 30,000                                                    |
| `tools`, `tool_choice`                      | Native Realtime function tool definitions and selection                                        |
| `functionCallHandler`                       | JavaScript handler receiving a tool name and JSON argument string; returns a `Promise<string>` |
| `toolCallTimeout`                           | Per-tool timeout; falls back to `websocketTimeout`, then 30,000 milliseconds                   |
| `maxToolIterations`                         | Maximum tool follow-up rounds in one turn; defaults to 8, allowed range 1 to 64                |

Realtime function definitions have top-level `name`, `description`, and `parameters`. Promptfoo also accepts nested Chat-style definitions and converts them. A `functionCallHandler` can return results to the model; validate the tool name and arguments before any side effects.

Structured user messages use `input_text`, `input_audio`, or `input_image` blocks. Multi-turn evals use `test.metadata.conversationId` to identify the conversation. See the [Realtime example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-realtime) for message formats, session management, and a function handler.

This provider creates conversational sessions. Dedicated Realtime transcription and translation sessions require their own integrations.

</details>

### Custom endpoints and proxies (Realtime)

Set `apiBaseUrl` as for other OpenAI providers. Promptfoo converts `https://` to `wss://` and `http://` to `ws://`, then appends `/realtime`. For example, `https://gateway.example.com/v1` becomes `wss://gateway.example.com/v1/realtime`.

## Environment variables {#supported-environment-variables}

Prefer provider configuration when comparing different settings in the same eval.

<details>
<summary>Credentials, endpoints, and request defaults</summary>

| Variable                       | Behavior                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`               | Default API key                                                                                                                 |
| `OPENAI_ORGANIZATION`          | Organization ID                                                                                                                 |
| `OPENAI_API_HOST`              | Constructs `https://<host>/v1`; checked before base URL environment variables                                                   |
| `OPENAI_API_BASE_URL`          | Full base URL; preferred over `OPENAI_BASE_URL` at the same environment level                                                   |
| `OPENAI_BASE_URL`              | Alternate full base URL                                                                                                         |
| `OPENAI_TEMPERATURE`           | Temperature for supported non-reasoning requests; defaults to 0                                                                 |
| `OPENAI_MAX_TOKENS`            | Output limit for non-reasoning requests; also a fallback for reasoning Responses requests                                       |
| `OPENAI_MAX_COMPLETION_TOKENS` | Output limit for reasoning Chat requests; preferred environment fallback for reasoning Responses requests. No built-in default. |
| `PROMPTFOO_EVAL_TIMEOUT_MS`    | Overall eval-call timeout, including Responses background polling                                                               |
| `REQUEST_TIMEOUT_MS`           | Standard request timeout, except requests with a longer model-specific timeout                                                  |
| `PROMPTFOO_REQUEST_BACKOFF_MS` | Retry backoff base in milliseconds; defaults to 5,000                                                                           |
| `PROMPTFOO_RETRY_5XX`          | Set to `true` to retry server errors                                                                                            |
| `PROMPTFOO_DELAY_MS`           | Delay between calls in milliseconds; defaults to 0                                                                              |

Within endpoint environment settings, `OPENAI_API_HOST` is checked first. Provider `env` base URL overrides are checked before process base URL values. Explicit provider connection settings take precedence over these environment variables.

</details>

## Troubleshooting

| Symptom                    | Check                                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication failure     | Confirm the selected key variable, project, and endpoint. With `apiKeyEnvar`, a missing named key does not fall back to the default key.     |
| Model not found            | Check your account's access and the [model lifecycle](https://developers.openai.com/api/docs/deprecations). Use an explicit endpoint prefix. |
| Unsupported parameter      | Match the option to the model and API. For reasoning models, check the output limit and reasoning setting first.                             |
| Empty or incomplete answer | Check the raw response and token usage. Reasoning may exhaust the output limit before producing a visible answer.                            |
| Unexpectedly reused output | Run with `--no-cache` to bypass Promptfoo's local response cache.                                                                            |

### Rate limits {#openai-rate-limits}

Promptfoo retries transient rate limits and adapts concurrency. For manual control, use `--max-concurrency 1`, add a delay such as `--delay 3000`, or adjust `PROMPTFOO_REQUEST_BACKOFF_MS`. Hard quota errors require resolving the account's quota or billing issue. See [rate limits](/docs/configuration/rate-limits).

### Server errors {#openai-flakiness}

Set `PROMPTFOO_RETRY_5XX=true` to retry HTTP server errors. Check the error and endpoint before increasing timeouts or retries.

### Timeouts {#timeout-configuration}

<Link id="gpt-5-pro-timeout-configuration" />

Responses requests with `background: true` and GPT-5 Pro variants use a 10-minute timeout unless `PROMPTFOO_EVAL_TIMEOUT_MS` is set. Regular requests use the standard request timeout, normally 5 minutes. Set an overall limit for a longer run:

```sh
PROMPTFOO_EVAL_TIMEOUT_MS=1200000 npx promptfoo@latest eval --no-cache
```

For these long-running Responses requests, `REQUEST_TIMEOUT_MS` does not override the automatic 10-minute timeout. See [background caching and cancellation](#prompt-caching-and-included-tool-results) before relying on an interrupted run to cancel upstream work.

## Migrating older configurations

{/* Preserve existing links to consolidated sections. */}
<Link id="video-generation-sora" />
<Link id="basic-usage" />
<Link id="configuration-options" />
<Link id="example-configuration" />
<Link id="image-to-video-generation" />
<Link id="video-remixing-legacy" />
<Link id="viewing-generated-videos" />
<Link id="pricing" />
<Link id="using-functions" />
<Link id="evaluating-assistants" />

<Link id="deep-research-models-responses-api-only" />
<Link id="gpt-51-codex-max" />

Use [OpenAI's deprecation schedule](https://developers.openai.com/api/docs/deprecations) as the source for shutdown dates and replacements. These migrations require more than changing a model name:

| Existing configuration                          | Migration                                                                                                                                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai:assistant:<id>`                         | The native Assistants API shut down on August 26, 2026. Move instructions, tools, and state to Responses; assistant IDs are not response IDs. See the [migration guide](https://developers.openai.com/api/docs/assistants/migration). |
| `openai:completion:*`                           | Native Babbage, Davinci, and GPT-3.5 Turbo Instruct models retire on September 28, 2026. Use Chat Completions or Responses with compatible prompts and options.                                                                       |
| `openai:video:*`                                | The native Videos API and Sora 2 models retire on September 24, 2026. OpenAI lists no replacement API.                                                                                                                                |
| `functions` and `function_call`                 | Replace them with `tools` and `tool_choice`, using the selected endpoint's schema.                                                                                                                                                    |
| Retired deep-research, Codex, or chat snapshots | Select an available model and re-run representative evals. Built-in research tools require the Responses endpoint.                                                                                                                    |

OpenAI-compatible services have their own lifecycle and API contracts. A provider implementation remaining in Promptfoo does not mean its model is still available from OpenAI.

## Agent providers {#agentic-providers}

{/* Preserve existing links to consolidated sections. */}
<Link id="agents-sdk" />
<Link id="codex-sdk" />
<Link id="codex-security-sdk" />
<Link id="codex-app-server" />

Choose a provider that matches the application you are testing:

| Application                                         | Provider guide                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| TypeScript Agents SDK tools, handoffs, and sessions | [OpenAI Agents SDK](/docs/providers/openai-agents)                    |
| Python Agents SDK application                       | [Agents SDK Python guide](/docs/guides/evaluate-openai-agents-python) |
| ChatKit integration                                 | [OpenAI ChatKit](/docs/providers/openai-chatkit)                      |
| Coding workflow with working-directory access       | [Codex SDK](/docs/providers/openai-codex-sdk)                         |
| Codex Security scan or finding validation           | [Codex Security SDK](/docs/providers/openai-codex-security)           |
| App-server events, approvals, and thread lifecycle  | [Codex app-server](/docs/providers/openai-codex-app-server)           |
