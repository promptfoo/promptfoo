# provider-cheaperinference (Cheaper Inference Example)

This directory contains an example configuration for using [Cheaper Inference](https://cheaperinference.com/) with promptfoo.

Cheaper Inference is an OpenAI-compatible gateway: one endpoint and one key for chat models from several makers, addressed by the maker's own model id (`claude-sonnet-5`, `gpt-5.6-luna`, `gemini-3.7-flash`), with no vendor prefix.

## Prerequisites

1. Create a Cheaper Inference API key from the [Cheaper Inference docs](https://cheaperinference.com/docs).
2. Set the environment variable:

   ```bash
   export CHEAPERINFERENCE_API_KEY=your_api_key_here
   ```

## Quick Start

```bash
npx promptfoo@latest init --example provider-cheaperinference
cd provider-cheaperinference
npx promptfoo eval -c promptfooconfig.yaml
```

## Example Config

The included `promptfooconfig.yaml` demonstrates:

- Two makers' models compared through one gateway and one key
- Chat requests with generation parameters
- Deterministic assertions on the responses

## Provider Syntax

```yaml
providers:
  - id: cheaperinference:claude-sonnet-5
```

## Custom Gateway Example

```yaml
providers:
  - id: cheaperinference:claude-sonnet-5
    config:
      apiBaseUrl: https://proxy.example.com/ci/v1
      apiKeyEnvar: MY_CHEAPERINFERENCE_TOKEN
```

## Resources

- [Cheaper Inference Provider Docs](https://www.promptfoo.dev/docs/providers/cheaperinference/)
- [Cheaper Inference Docs](https://cheaperinference.com/docs)
- [Promptfoo Docs](https://www.promptfoo.dev/docs/)
