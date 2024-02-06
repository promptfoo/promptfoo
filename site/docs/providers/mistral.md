# Mistral AI

The [Mistral AI API](https://docs.mistral.ai/api/) offers access to Mistral models such as `mistral-tiny`, `mistral-small`, and `mistral-medium`.

Here's an example config that compares Mistral Medium, Mistral Small, and OpenAI GPT-3.5:

```yaml
providers:
  - mistral:mistral-medium
  - mistral:mistral-small
  - openai:chat:gpt-3.5-turbo
```

Be sure to set the `MISTRAL_API_KEY` environment variable!