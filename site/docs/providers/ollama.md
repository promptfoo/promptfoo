---
sidebar_label: Ollama
description: "Run open-source LLMs locally using Ollama's streamlined interface for rapid prototyping and offline model evaluation"
---

# Ollama

The `ollama` provider is compatible with [Ollama](https://github.com/ollama/ollama), which enables access to Llama, Mixtral, Mistral, and more.

You can use its `/api/generate` endpoint by specifying any of the following providers from the [Ollama library](https://ollama.com/library):

- `ollama:completion:llama3.2`
- `ollama:completion:qwen3`
- `ollama:completion:gemma3`
- `ollama:completion:qwen2.5-coder`
- `ollama:completion:codellama`
- ...

A bare `ollama:<model>` (for example `ollama:llama3.2`) also works and routes to the
completion provider.

Or, use the `/api/chat` endpoint for chat-formatted prompts:

- `ollama:chat:llama3.2`
- `ollama:chat:llama3.3`
- `ollama:chat:qwen3`
- `ollama:chat:qwen3.5`
- `ollama:chat:qwen3-coder`
- `ollama:chat:gemma3`
- `ollama:chat:gemma4`
- `ollama:chat:gpt-oss`
- `ollama:chat:deepseek-r1`
- `ollama:chat:mistral`
- `ollama:chat:phi4`
- ...

Capability varies by model — check the [library](https://ollama.com/library) to see which
models support tools, reasoning, or vision. As of this writing `qwen3`, `qwen3.5`, `gpt-oss`, and
`deepseek-r1` support reasoning; `gemma3`, `gemma4`, and `llava` support vision.

Small models are useful for smoke-testing a config without a long download —
`qwen3:0.6b` (~500MB) supports both tools and reasoning, and `all-minilm` (~45MB)
covers embeddings.

We also support the `/api/embed` endpoint via `ollama:embeddings:<model name>` (or the singular `ollama:embedding:<model name>`) for model-graded assertions such as [similarity](/docs/configuration/expected-outputs/similar/).

Supported environment variables:

- `OLLAMA_BASE_URL` - protocol, host name, and port (defaults to `http://localhost:11434`)
- `OLLAMA_API_KEY` - (optional) api key that is passed as the Bearer token in the Authorization Header when calling the API
- `REQUEST_TIMEOUT_MS` - request timeout in milliseconds

To pass configuration options to Ollama, use the `config` key. See Ollama's
[parameter reference](https://github.com/ollama/ollama/blob/main/docs/modelfile.mdx#parameter)
for what each one does:

```yaml title="promptfooconfig.yaml"
providers:
  - id: ollama:chat:llama3.3
    config:
      num_predict: 1024
      temperature: 0.7
      top_p: 0.9
      think: true # Enable thinking/reasoning (Ollama 0.34+ also accepts 'low'/'medium'/'high'/'max')
      showThinking: true # Include the reasoning trace in the output (default: true)
      keep_alive: '5m' # How long Ollama keeps the model loaded after the request
```

## Reasoning models

Reasoning models (`qwen3`, `deepseek-r1`, `gpt-oss`, and others) return their reasoning
trace in a separate `thinking` field rather than in the response content. Promptfoo
prepends it to the output as `Thinking: ...`, matching the behavior of the OpenAI and
Anthropic providers.

Note that recent Ollama versions emit `thinking` for these models **by default**, without
you setting `think: true`. If you only want the final answer, you have two options:

```yaml title="promptfooconfig.yaml"
providers:
  # Keep the model reasoning, but exclude the trace from the output your assertions see
  - id: ollama:chat:qwen3
    config:
      showThinking: false

  # Or turn reasoning off entirely at the model level
  - id: ollama:chat:qwen3
    config:
      think: false
```

`showThinking` is a promptfoo-side rendering option and is never sent to the Ollama API.

:::warning
Reasoning tokens count against `num_predict`. If the budget is exhausted inside the
thinking block, the model never emits any content — the output will contain only the
reasoning trace, and `finish-reason` will be `length`. Raise `num_predict` or set
`think: false` if you need a short answer from a reasoning model.
:::

Responses also carry a normalized `finishReason` (`stop`, `length`, …) derived from
Ollama's `done_reason`, which you can assert on with
[`finish-reason`](/docs/configuration/expected-outputs/deterministic/#finish-reason).

Config keys promptfoo does not recognize are **silently dropped** before the request is
sent. Run with `LOG_LEVEL=debug` to see which. The supported `options` keys track
Ollama's current [Options struct](https://github.com/ollama/ollama/blob/main/api/types.go):
`num_predict`, `num_keep`, `seed`, `top_k`, `top_p`, `min_p`, `typical_p`,
`repeat_last_n`, `temperature`, `repeat_penalty`, `presence_penalty`,
`frequency_penalty`, `stop`, `num_ctx`, `num_batch`, `num_gpu`, `main_gpu`,
`use_mmap`, `num_thread`, and `draft_num_predict`.

Note that `max_tokens` is an OpenAI key — Ollama ignores it, so use `num_predict`.
`typical_p` is accepted today but marked deprecated upstream, so prefer `top_p` or `min_p`.

Options that newer Ollama releases removed (`mirostat`, `mirostat_tau`, `mirostat_eta`,
`tfs_z`, `num_gqa`, `f16_kv`, `logits_all`, `vocab_only`, `low_vram`, `use_mlock`,
`embedding_only`, `rope_frequency_base`, `rope_frequency_scale`, `penalize_newline`) are
still forwarded so configs pointed at an older `OLLAMA_BASE_URL` keep working. Current
servers ignore them, and promptfoo logs a debug notice when you use one.

## Structured outputs

Set `format` to `json`, or to a JSON schema, to constrain the model's output:

```yaml
providers:
  - id: ollama:chat:qwen3
    config:
      think: false # see the warning below
      format:
        type: object
        properties:
          capital: { type: string }
        required: [capital]
```

This returns clean JSON (`{ "capital": "Paris" }`) rather than a markdown-fenced block,
so assertions like [`is-json`](/docs/configuration/expected-outputs/deterministic/#is-json)
work reliably.

:::warning
On a reasoning model, combine `format` with `think: false`. Reasoning models emit a trace
by default, and promptfoo prepends it as `Thinking: ...`, which makes the output no longer
valid JSON. Note that `showThinking: false` is **not** enough on its own — it hides the
trace, but the model still spends its `num_predict` budget reasoning, so the JSON content
can come back empty.
:::

## Completion-only parameters

`ollama:completion:*` uses `/api/generate`, which accepts a few parameters the chat
endpoint does not:

```yaml
providers:
  - id: ollama:completion:qwen2.5-coder
    config:
      system: 'You are a terse assistant.' # override the model's system prompt
      template: '{{ .Prompt }}' # override the model's prompt template
      suffix: '    return result' # fill-in-the-middle, for models that support insert
```

`raw: true` bypasses prompt templating entirely and is **mutually exclusive** with
`system` and `template` — Ollama rejects the combination with
`raw mode does not support template, system, or context` (HTTP 400). Use it alone:

```yaml
providers:
  - id: ollama:completion:qwen2.5-coder
    config:
      raw: true
```

`tools` only applies to `ollama:chat:*`; `/api/generate` has no tool support.

You can also pass arbitrary fields directly to the Ollama API using the `passthrough`
option. A `passthrough.options` object is merged into the computed options rather than
replacing them:

```yaml title="promptfooconfig.yaml"
providers:
  - id: ollama:chat:llama3.3
    config:
      passthrough:
        format: 'json'
        # Any other Ollama API fields
```

## Function Calling

Ollama chat models that support function calling (like Llama 3.1, Llama 3.3, Qwen, and others) can use tools with the `tools` config:

```yaml title="promptfooconfig.yaml"
prompts:
  - 'What is the weather like in {{city}}?'

providers:
  - id: ollama:chat:llama3.3
    config:
      tools:
        - type: function
          function:
            name: get_current_weather
            description: Get the current weather in a given location
            parameters:
              type: object
              properties:
                location:
                  type: string
                  description: City and state, e.g. San Francisco, CA
                unit:
                  type: string
                  enum: [celsius, fahrenheit]
              required: [location]

tests:
  - vars:
      city: Boston
    assert:
      - type: is-valid-openai-tools-call
```

Tools can also be loaded from an external file, which keeps large schemas out of the
config:

```yaml
providers:
  - id: ollama:chat:llama3.3
    config:
      tools: file://tools.json
```

:::note
`tools` only applies to `ollama:chat:*`. The `/api/generate` endpoint used by
`ollama:completion:*` has no tool support, so a `tools` block there has no effect.
:::

## Using Ollama as a Local Grading Provider

### Using Ollama for Model-Graded Assertions

Ollama can be used as a local grading provider for assertions that require language model evaluation. When you have tests that use both text-based assertions (like `llm-rubric`, `answer-relevance`) and embedding-based assertions (like `similar`), you can configure different Ollama models for each type:

```yaml title="promptfooconfig.yaml"
defaultTest:
  options:
    provider:
      # Text provider for llm-rubric, answer-relevance, factuality, etc.
      text:
        id: ollama:chat:gemma3:27b
        config:
          temperature: 0.1

      # Embedding provider for similarity assertions
      embedding:
        id: ollama:embeddings:nomic-embed-text
        config:
          # embedding-specific config if needed

providers:
  - ollama:chat:llama3.3
  - ollama:chat:qwen3:8b

tests:
  - vars:
      question: 'What is the capital of France?'
    assert:
      # Uses the text provider (gemma3:27b)
      - type: llm-rubric
        value: 'The answer correctly identifies Paris as the capital'

      # Uses the embedding provider (nomic-embed-text)
      - type: similar
        value: 'Paris is the capital city of France'
        threshold: 0.85
```

When running with `--max-concurrency 1`, no per-eval timeout, and no conversation variables (`{{_conversation}}`), Promptfoo groups eligible model-graded assertion calls by grading provider ID to reduce local model switching. This is not request batching; each assertion call still runs separately, and report row order is unchanged.

### Using Ollama Embedding Models for Similarity Assertions

Ollama's embedding models can be used with the `similar` assertion to check semantic similarity between outputs and expected values:

```yaml title="promptfooconfig.yaml"
providers:
  - ollama:chat:llama3.2

defaultTest:
  assert:
    - type: similar
      value: 'The expected response should explain the concept clearly'
      threshold: 0.8
      # Override the default embedding provider to use Ollama
      provider: ollama:embeddings:nomic-embed-text

tests:
  - vars:
      question: 'What is photosynthesis?'
    assert:
      - type: similar
        value: 'Photosynthesis is the process by which plants convert light energy into chemical energy'
        threshold: 0.85
```

You can also set the embedding provider globally for all similarity assertions:

```yaml title="promptfooconfig.yaml"
defaultTest:
  options:
    provider:
      embedding:
        id: ollama:embeddings:nomic-embed-text
  assert:
    - type: similar
      value: 'Expected semantic content'
      threshold: 0.75

providers:
  - ollama:chat:llama3.2

tests:
  # Your test cases here
```

### Embedding input length

Embedding models have small context windows — `all-minilm` defaults to 256 tokens and
tops out at 512. Promptfoo sends `truncate: false`, so input that exceeds the window
fails with an explicit error rather than silently embedding only the first N tokens and
producing a plausible-but-wrong similarity score:

```
Ollama API error: 400 Bad Request: the input length exceeds the context length.
Raise `config.num_ctx` (up to the model's own maximum, shown by `ollama show all-minilm`),
or set `config.truncate: true` to embed only the first num_ctx tokens -- note that
truncating silently changes similarity scores.
```

Both remedies are configurable:

```yaml title="promptfooconfig.yaml"
defaultTest:
  options:
    provider:
      embedding:
        id: ollama:embeddings:all-minilm
        config:
          num_ctx: 512 # raise the window (bounded by the model's maximum)
          # truncate: true  # or accept truncation
          # dimensions: 128 # Matryoshka models only
          # keep_alive: 5m
```

Popular Ollama embedding models include:

- `ollama:embeddings:nomic-embed-text` - General purpose embeddings
- `ollama:embeddings:mxbai-embed-large` - High-quality embeddings
- `ollama:embeddings:bge-m3` - Multilingual, long context
- `ollama:embeddings:all-minilm` - Lightweight, fast embeddings

## Using a Remote Ollama Server

To connect to Ollama running on another machine (e.g., a more powerful server on your local network), set `OLLAMA_BASE_URL` to the remote address:

```bash
export OLLAMA_BASE_URL="http://192.168.1.100:11434"
```

Or in a `.env` file:

```
OLLAMA_BASE_URL=http://192.168.1.100:11434
```

```bash
promptfoo eval -c promptfooconfig.yaml --env-file .env
```

Make sure the Ollama server is listening on `0.0.0.0` so it accepts remote connections. For Docker Compose, this is typically the default. If running Ollama directly, set `OLLAMA_HOST=0.0.0.0:11434` before starting the server.

## `localhost` and IPv4 vs IPv6

If locally developing with `localhost` (promptfoo's default),
and Ollama API calls are failing with `ECONNREFUSED`,
then there may be an IPv4 vs IPv6 issue going on with `localhost`.
Ollama's default host uses [`127.0.0.1`](https://github.com/ollama/ollama/blob/main/envconfig/config.go),
which is an IPv4 address.
The possible issue here arises from `localhost` being bound to an IPv6 address,
as configured by the operating system's `hosts` file.
To investigate and fix this issue, there's a few possible solutions:

1. Change Ollama server to use IPv6 addressing by running
   `export OLLAMA_HOST=":11434"` before starting the Ollama server.
   Note this IPv6 support requires Ollama version `0.0.20` or newer.
2. Change promptfoo to directly use an IPv4 address by configuring
   `export OLLAMA_BASE_URL="http://127.0.0.1:11434"`.
3. Update your OS's [`hosts`](<https://en.wikipedia.org/wiki/Hosts_(file)>) file
   to bind `localhost` to IPv4.

## Evaluating models serially

By default, promptfoo evaluates all providers concurrently for each prompt. However, you can run evaluations serially using the `-j 1` option:

```bash
promptfoo eval -j 1
```

This serializes the eval's **target** calls: one provider and prompt at a time.

Ordering caveat: the evaluator runs test cases marked `options.runSerially` as a separate
partition ahead of the rest, so a config using that option does not execute in strict
test-case order even at `-j 1`.

Model-graded assertions run on a separate path. When grading grouping is active they are
serialized too, but if it is disabled — by a per-eval timeout or a `{{_conversation}}`
variable — up to `PROMPTFOO_ASSERTIONS_MAX_CONCURRENCY` grader calls (3 by default) can
still overlap within a single test case.

:::caution
Serial execution does **not** by itself keep only one model in memory. Ollama holds each
model it has loaded for its own `keep_alive` window (5 minutes by default), so evaluating
two providers serially can still leave both resident — confirm with `ollama ps`.

To actually free a model as soon as its request finishes, set `keep_alive: 0`:

```yaml
providers:
  - id: ollama:chat:llama3.2
    config:
      keep_alive: 0 # unload immediately after each request
  - id: ollama:chat:qwen3
    config:
      keep_alive: 0
```

:::

This approach is particularly useful for:

- Local setups with limited RAM
- Testing multiple resource-intensive models
- Debugging provider-specific issues
