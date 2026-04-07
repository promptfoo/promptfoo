---
sidebar_label: Kelly Intelligence
description: Configure Kelly Intelligence (api.thedailylesson.com) — an OpenAI-compatible API with a built-in 162,000-word vocabulary RAG layer — for evaluating tutoring, language learning, and word-grounded chat.
---

# Kelly Intelligence

[Kelly Intelligence](https://api.thedailylesson.com) exposes an [OpenAI-compatible HTTP endpoint](https://api.thedailylesson.com/openapi.json) at `https://api.thedailylesson.com/v1`, so you can override the [OpenAI provider](/docs/providers/openai/) to talk to it. It is built on top of Claude and operated by [Lesson of the Day, PBC](https://lotdpbc.com).

To use Kelly Intelligence in an eval, set `apiBaseUrl` to `https://api.thedailylesson.com/v1` and `apiKey` to your `KELLY_API_KEY` (or any value if you only want to call the public `/v1/demo` endpoint, which is rate-limited at 5 requests per hour per IP).

```yaml
providers:
  - id: openai:chat:kelly-haiku
    config:
      apiBaseUrl: https://api.thedailylesson.com/v1
      apiKey: ${KELLY_API_KEY}
```

The available model IDs are `kelly-haiku`, `kelly-sonnet`, and `kelly-opus`. The free tier requires no credit card; sign up at [api.thedailylesson.com](https://api.thedailylesson.com).

If desired, you can use the `OPENAI_BASE_URL` environment variable instead of the `apiBaseUrl` config.
