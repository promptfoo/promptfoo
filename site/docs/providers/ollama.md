---
sidebar_label: Ollama
---

# Ollama

The `ollama` provider is compatible with [Ollama](https://github.com/jmorganca/ollama), which enables access to Llama, Mixtral, Mistral, and more.

You can use its `/api/generate` endpoint by specifying any of the following providers from the [Ollama library](https://ollama.ai/library):

- `ollama:completion:llama3.2`
- `ollama:completion:llama3.3`
- `ollama:completion:phi4`
- `ollama:completion:qwen2.5`
- `ollama:completion:granite3.2`
- `ollama:completion:deepcoder`
- `ollama:completion:codellama`
- `ollama:completion:llama2-uncensored`
- ...

Or, use the `/api/chat` endpoint for chat-formatted prompts:

- `ollama:chat:llama3.2`
- `ollama:chat:llama3.2:1b`
- `ollama:chat:llama3.2:3b`
- `ollama:chat:llama3.3`
- `ollama:chat:llama3.3:70b`
- `ollama:chat:phi4`
- `ollama:chat:phi4-mini`
- `ollama:chat:qwen2.5`
- `ollama:chat:qwen2.5:14b`
- `ollama:chat:qwen2.5:72b`
- `ollama:chat:qwq:32b`
- `ollama:chat:granite3.2`
- `ollama:chat:granite3.2:2b`
- `ollama:chat:granite3.2:8b`
- `ollama:chat:deepcoder`
- `ollama:chat:deepcoder:1.5b`
- `ollama:chat:deepcoder:14b`
- `ollama:chat:mixtral:8x7b`
- `ollama:chat:mixtral:8x22b`
- ...

We also support the `/api/embeddings` endpoint via `ollama:embeddings:<model name>` for model-graded assertions such as [similarity](/docs/configuration/expected-outputs/similar/).

Supported environment variables:

- `OLLAMA_BASE_URL` - protocol, host name, and port (defaults to `http://localhost:11434`)
- `OLLAMA_API_KEY` - (optional) api key that is passed as the Bearer token in the Authorization Header when calling the API
- `REQUEST_TIMEOUT_MS` - request timeout in milliseconds

To pass configuration options to Ollama, use the `config` key like so:

```yaml title="promptfooconfig.yaml"
providers:
  - id: ollama:chat:llama3.3
    config:
      num_predict: 1024
```

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
  - ollama:chat:qwen2.5:14b

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

Popular Ollama embedding models include:

- `ollama:embeddings:nomic-embed-text` - General purpose embeddings
- `ollama:embeddings:mxbai-embed-large` - High-quality embeddings
- `ollama:embeddings:all-minilm` - Lightweight, fast embeddings

## `localhost` and IPv4 vs IPv6

If locally developing with `localhost` (promptfoo's default),
and Ollama API calls are failing with `ECONNREFUSED`,
then there may be an IPv4 vs IPv6 issue going on with `localhost`.
Ollama's default host uses [`127.0.0.1`](https://github.com/jmorganca/ollama/blob/main/api/client.go#L19),
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

This sets concurrency to 1, which means:

1. Evaluations happen one provider at a time, then one prompt at a time.
2. Only one model is loaded into memory, conserving system resources.
3. You can easily swap models between evaluations without conflicts.

This approach is particularly useful for:

- Local setups with limited RAM
- Testing multiple resource-intensive models
- Debugging provider-specific issues
