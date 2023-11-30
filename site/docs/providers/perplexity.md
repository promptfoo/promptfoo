# Perplexity

The [Perplexity API](https://blog.perplexity.ai/blog/introducing-pplx-api) (pplx-api) offers access to Perplexity, Mistral, Llama, and other models.

It is compatible with the [OpenAI API](/docs/providers/openai). In order to use the Perplexity API in an eval, set `OPENAI_API_BASE_URL` environment variable to `https://api.perplexity.ai` or the `apiHost` config key to `api.perplexity.ai`.

Here's an example config that compares Perplexity's 70B model with Llama-2 70B.

```yaml
providers:
  - id: openai:chat:pplx-70b-chat-alpha
    config:
      apiHost: api.perplexity.ai
  - id: openai:chat:llama-2-70b-chat
    config:
      apiHost: api.perplexity.ai
```

For a complete list of supported models, see Perplexity's [chat completion documentation](https://docs.perplexity.ai/reference/post_chat_completions).
