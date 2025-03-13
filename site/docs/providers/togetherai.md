# Together AI

[Together AI](https://www.together.ai/) provides access to a wide range of open-source language models through an API compatible with OpenAI's interface.

The Together AI provider is compatible with all the options provided by the [OpenAI provider](/docs/providers/openai/).

Here's an example of how to configure the provider to use the `meta-llama/Llama-3-8b-chat-hf` model:

```yaml
providers:
  - id: togetherai:meta-llama/Llama-3.2-1B-Vision-Instruct-Turbo
    config:
      temperature: 0.7
      apiKeyEnvar: TOGETHER_API_KEY
```

If you prefer to use an environment variable directly, set `TOGETHER_API_KEY`.

You can specify the model type explicitly:

```yaml
providers:
  - id: togetherai:chat:mistralai/Mixtral-8x7B-Instruct-v0.1
  - id: togetherai:completion:codellama/CodeLlama-34b-Python-hf
  - id: togetherai:embedding:togethercomputer/m2-bert-80M-8k-retrieval
```

If no model type is specified, it defaults to the chat completion type.

For more information on the available models and API usage, refer to the [Together AI documentation](https://docs.together.ai/docs/chat-models).
