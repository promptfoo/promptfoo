# vllm

vllm's [OpenAI-compatible server](https://docs.vllm.ai/en/latest/getting_started/quickstart.html#openai-compatible-server) offers access to many [supported models](https://docs.vllm.ai/en/latest/models/supported_models.html) for local inference from Huggingface Transformers.

In order to use vllm in your eval, set the `apiBaseUrl` variable to `http://localhost:8080` (or wherever you're hosting vllm).

Here's an example config that uses Mixtral-8x7b for text completions:

```yaml
providers:
  - id: openai:completion:mistralai/Mixtral-8x7B-v0.1
    config:
      apiBaseUrl: http://localhost:8080/v1
```

If desired, you can instead use the `OPENAI_BASE_URL` environment variable instead of the `apiBaseUrl` config.
