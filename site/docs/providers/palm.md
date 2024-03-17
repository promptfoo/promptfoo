---
sidebar_position: 43
---

# Google AI Studio

The `google` provider is compatible with Google AI Studio (formerly known as [PaLM](https://developers.generativeai.google/)), which offers access to Gemini models.

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

- `google:gemini-pro`
- `google:gemini-pro-vision`
- `google:aqa` (attributed question answering)
- `google:chat-bison-001`

:::tip
If you are using Google Vertex, see the [`vertex` provider](/docs/providers/vertex).
:::

Supported environment variables:

- `GOOGLE_API_KEY` (required) - Google AI Studio/PaLM API token
- `GOOGLE_API_HOST` - used to override the Google API host, defaults to `generativelanguage.googleapis.com`

The PaLM provider supports various [configuration options](https://github.com/promptfoo/promptfoo/blob/main/src/providers/palm.ts#L9-L18) such as `safetySettings`, `stopSequences`, `temperature`, `maxOutputTokens`, `topP`, and `topK` that can be used to customize the behavior of the model like so:

```yaml
providers:
  - model: google:gemini-pro
    config:
      temperature: 0
      maxOutputTokens: 1024
```
