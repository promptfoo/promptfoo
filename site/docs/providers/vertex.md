---
sidebar_position: 42
---

# Google Vertex

The `vertex` provider is compatible with Google's [Vertex AI](https://cloud.google.com/vertex-ai) offering, which offers access to models such as `bison`.

You can use it by specifying any of the available stable or latest [model versions](https://cloud.google.com/vertex-ai/docs/generative-ai/learn/model-versioning) offered by Vertex AI. These include:

- `vertex:chat-bison`
- `vertex:chat-bison@001`
- `vertex:chat-bison-32k`
- `vertex:chat-bison-32k@001`
- `vertex:codechat-bison`
- `vertex:codechat-bison@001`
- `vertex:codechat-bison-32k`
- `vertex:codechat-bison-32k@001`

Supported environment variables:

- `VERTEX_API_KEY` (required) - gcloud API token
- `VERTEX_PROJECT_ID` (required) - gcloud project ID
- `VERTEX_REGION` - gcloud region, defaults to `us-central1`
- `VERTEX_PUBLISHER` - model publisher, defaults to `google`
- `VERTEX_API_HOST` - used to override the full Google API host, e.g. for an LLM proxy, defaults to `{region}-aiplatform.googleapis.com`

The Vertex provider also supports various [configuration options](https://github.com/promptfoo/promptfoo/blob/main/src/providers/vertex.ts#L7-L22) such as context, examples, temperature, maxOutputTokens, and more, which can be used to customize the the behavior of the model like so:

```yaml
providers:
  - id: vertex:chat-bison-32k
    config:
      temperature: 0
      maxOutputTokens: 1024
```
