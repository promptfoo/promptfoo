---
slug: /features/helicone-gateway
title: Helicone AI Gateway - Self-hosted LLM gateway
description: Learn how to use the Helicone AI Gateway for unified access to 100+ LLM providers with local control and smart caching
authors: [promptfoo_team]
tags: [helicone-gateway, self-hosted, llm-providers, caching, v0.115.0, june-2025]
keywords: [Helicone AI Gateway, self-hosted, LLM providers, caching, rate limiting, local control]
date: 2025-06-30T23:59
---

# Helicone AI Gateway

Self-hosted open-source gateway for unified LLM access:

```yaml
providers:
  - helicone:openai/gpt-4.1
  - helicone:anthropic/claude-4-sonnet
  - helicone:groq/llama-4-maverick
    config:
      baseUrl: "http://localhost:8787"  # Your gateway
```

**Key features:**

- Route to 100+ LLM providers
- Smart caching & rate limiting
- Local control over your data
- OpenAI-compatible interface

## Quick start

```bash
# Use Helicone gateway
npx helicone start  # Start local gateway
npx promptfoo eval --provider helicone:openai/gpt-4.1
```

---

**Back to**: [Release notes index](/releases/) 