---
title: EvoLink
description: Connect Promptfoo to EvoLink's OpenAI-compatible chat API, configure secure API-key authentication, and evaluate smart-routed model responses with test cases.
sidebar_position: 42
---

# EvoLink

[EvoLink](https://evolink.ai/) exposes an OpenAI-compatible chat completions API for
hosted language models and its `evolink/auto` smart router. Promptfoo connects to that API through
the existing [OpenAI provider](/docs/providers/openai/) with a custom API host; there is no separate
`evolink:` provider prefix.

## Setup

1. Create an API key in the [EvoLink dashboard](https://evolink.ai/dashboard/keys).
2. Export it as `EVOLINK_API_KEY`:

   ```bash
   export EVOLINK_API_KEY=your_api_key_here
   ```

## Configuration

Use `direct.evolink.ai` as the API host. Promptfoo builds the
`https://direct.evolink.ai/v1/chat/completions` request URL from this value.

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Evaluate EvoLink smart routing

prompts:
  - 'Answer in one sentence: {{question}}'

providers:
  - id: openai:chat:evolink/auto
    label: EvoLink Auto
    config:
      apiHost: direct.evolink.ai
      apiKey: "{{ env.EVOLINK_API_KEY | default('__EVOLINK_API_KEY_REQUIRED__', true) }}"
      temperature: 0.2

tests:
  - vars:
      question: What is the capital of France?
    assert:
      - type: contains
        value: Paris
```

`apiHost` pins requests to EvoLink even when OpenAI endpoint variables are set. The non-empty
fallback token prevents the generic provider from substituting `OPENAI_API_KEY` when
`EVOLINK_API_KEY` is unset or empty. EvoLink rejects that placeholder with a `401` response until
you export a real key.

## Model selection

Set the final provider path segment to the exact model ID accepted by EvoLink. Keep the
configuration above and change only `id`, for example from `openai:chat:evolink/auto` to
`openai:chat:MiniMax-M2.5`.

`evolink/auto` can choose a different upstream model for each request. EvoLink returns the selected
model in its response, so do not use the smart router when a test depends on one model's specific
capabilities or stable outputs.

EvoLink supports `top_k` on the smart-routing endpoint. Add provider-specific request fields under
`config.passthrough` in the same provider:

```yaml
passthrough:
  top_k: 40
```

This configuration covers EvoLink's chat completions interface. Use Promptfoo's
[HTTP provider](/docs/providers/http/) for EvoLink APIs with different request or response shapes.

## Example

Initialize the runnable example:

```bash
npx promptfoo@latest init --example provider-evolink
cd provider-evolink
npx promptfoo@latest eval --no-cache
```

## Additional resources

- [EvoLink API documentation](https://docs.evolink.ai/en/introduction)
- [EvoLink Auto documentation](https://docs.evolink.ai/en/api-manual/language-series/evolink-auto/evolink-auto-quickstart)
- [EvoLink privacy policy](https://evolink.ai/privacy)
- [OpenAI provider configuration](/docs/providers/openai/)
