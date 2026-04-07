---
sidebar_label: Kelly Intelligence
description: OpenAI-compatible API with a built-in 162,000-word vocabulary RAG layer. Built on Claude. Use for tutoring, language-learning, and word-grounded evals.
---

# Kelly Intelligence

[Kelly Intelligence](https://api.thedailylesson.com) is an [OpenAI-compatible API](https://api.thedailylesson.com/openapi.json) at `https://api.thedailylesson.com/v1`. Configure it by overriding the [OpenAI provider](/docs/providers/openai/) base URL. It is built on Claude and operated by [Lesson of the Day, PBC](https://lotdpbc.com).

To use Kelly Intelligence in an eval, set `apiBaseUrl` to `https://api.thedailylesson.com/v1` and `apiKey` to your `KELLY_API_KEY`. The public `/v1/demo` endpoint accepts any `apiKey` value but is rate-limited to 5 requests per hour per IP.

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:chat:kelly-haiku
    config:
      apiBaseUrl: https://api.thedailylesson.com/v1
      apiKey: ${KELLY_API_KEY}
```

The available model IDs are `kelly-haiku`, `kelly-sonnet`, and `kelly-opus`. The free tier requires no credit card; sign up at [api.thedailylesson.com](https://api.thedailylesson.com).

If desired, you can use the `OPENAI_BASE_URL` environment variable instead of the `apiBaseUrl` config.
