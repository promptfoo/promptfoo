# provider-atlascloud (Atlas Cloud Example)

This directory contains an example configuration for using [Atlas Cloud](https://www.atlascloud.ai/) with promptfoo.

The example uses the `deepseek-v3` chat model ID from Atlas Cloud's [first-model guide](https://www.atlascloud.ai/docs/en/models/get-start). Choose other models using the exact IDs and supported options in Atlas Cloud's model library.

## Prerequisites

1. Create an Atlas Cloud API key from the [Atlas Cloud docs](https://www.atlascloud.ai/docs/en/models/get-start).
2. Set the environment variable:

   ```bash
   export ATLASCLOUD_API_KEY=your_api_key_here
   ```

## Quick Start

```bash
npx promptfoo@latest init --example provider-atlascloud
cd provider-atlascloud
npx promptfoo eval -c promptfooconfig.yaml
```

## Example Config

The included `promptfooconfig.yaml` demonstrates:

- Atlas Cloud chat requests with generation parameters
- Deterministic assertions on the responses

## Provider Syntax

```yaml
providers:
  - id: atlascloud:deepseek-v3
```

## Custom Gateway Example

```yaml
providers:
  - id: atlascloud:deepseek-v3
    config:
      apiBaseUrl: https://proxy.example.com/atlas/v1
      apiKeyEnvar: MY_ATLASCLOUD_TOKEN
```

## Resources

- [Atlas Cloud Provider Docs](https://www.promptfoo.dev/docs/providers/atlascloud/)
- [Atlas Cloud Docs](https://www.atlascloud.ai/docs)
- [Promptfoo Docs](https://www.promptfoo.dev/docs/)
