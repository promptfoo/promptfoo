---
sidebar_position: 43
---

# Google AI Studio

The `palm` provider is compatible with Google AI Studio (formerly known as [PaLM](https://developers.generativeai.google/)), which offers access to Gemini models.

You can use it by specifying one of the [available models](https://developers.generativeai.google/models/language). Currently, the following models are supported:

- `palm:gemini-pro`
- `palm:gemini-pro-vision`
- `palm:chat-bison-001`

Supported environment variables:

- `PALM_API_KEY` (required) - Google PaLM API token
- `PALM_API_HOST` - used to override the Google API host, defaults to `generativelanguage.googleapis.com`

The PaLM provider supports various [configuration options](https://github.com/promptfoo/promptfoo/blob/main/src/providers/palm.ts#L9-L18) such as `safetySettings`, `stopSequences`, `temperature`, `maxOutputTokens`, `topP`, and `topK` that can be used to customize the behavior of the model like so:

```yaml
providers:
  - id: palm:gemini-pro
    config:
      temperature: 0
      maxOutputTokens: 1024
```
