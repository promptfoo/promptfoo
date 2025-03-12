# LiteLLM

The [LiteLLM](https://docs.litellm.ai/docs/) provides access to hundreds of LLMs.

Because it's compatible with the OpenAI API, you can configure promptfoo to use LiteLLM by overriding the `apiBaseUrl` variable to point to the LiteLLM service.

Here's an example configuration for using LiteLLM with promptfoo:

```yaml
providers:
  - id: openai:chat:<model name>
    config:
      apiBaseUrl: http://0.0.0.0:4000/
```

For example, to use gpt-4o:

```yaml
  // highlight-start
  - id: openai:chat:gpt-4o
  // highlight-end
    config:
      apiBaseUrl: http://0.0.0.0:4000/
```

Or to use Anthropic's Claude (remember, we're not actually using the OpenAI API, we're using LiteLLM which supports the OpenAI format):

```yaml
  // highlight-start
  - id: openai:chat:claude-3.5
  // highlight-end
    config:
      apiBaseUrl: http://0.0.0.0:4000/
```

Alternatively, you can use the `OPENAI_BASE_URL` environment variable instead of the `apiBaseUrl` config property:

```sh
OPENAI_BASE_URL=http://0.0.0.0:4000/
```
