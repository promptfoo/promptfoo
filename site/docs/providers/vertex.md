---
sidebar_position: 42
---

# Google Vertex

The `vertex` provider is compatible with Google's [Vertex AI](https://cloud.google.com/vertex-ai) offering, which offers access to models such as Gemini and Bison.

You can use it by specifying any of the available stable or latest [model versions](https://cloud.google.com/vertex-ai/docs/generative-ai/learn/model-versioning) offered by Vertex AI. These include:

- `vertex:gemini-pro`
- `vertex:gemini-ultra`
- `vertex:chat-bison`
- `vertex:chat-bison@001`
- `vertex:chat-bison-32k`
- `vertex:chat-bison-32k@001`
- `vertex:codechat-bison`
- `vertex:codechat-bison@001`
- `vertex:codechat-bison-32k`
- `vertex:codechat-bison-32k@001`

:::tip
If you are using Google AI Studio, see the [`google` provider](/docs/providers/palm).
:::

## Authenticating with Google

To call Vertex AI models in Node, you'll need to install Google's official auth client as a peer dependency:

```sh
npm i google-auth-library
```

Make sure the [Vertex AI API](https://console.cloud.google.com/apis/enableflow?apiid=aiplatform.googleapis.com) is enabled for the relevant project in Google Cloud. Then, ensure that you've selected that project in the `gcloud` cli:

```sh
gcloud config set project PROJECT_ID
```

Next, make sure that you've authenticated to Google Cloud using one of these methods:

- You are logged into an account using `gcloud auth application-default login`
- You are running on a machine that uses a service account with the appropriate role
- You have downloaded the credentials for a service account with the appropriate role and set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable to the path of the credentials file.

## Environment variables

- `VERTEX_API_KEY` - gcloud API token. The easiest way to get an API key is to run `gcloud auth print-access-token`.
- `VERTEX_PROJECT_ID` - gcloud project ID
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

## Safety settings

AI safety settings can be configured using the `safetySettings` key. For example:

```yaml
- id: vertex:gemini-pro
  config:
    safetySettings:
      - category: HARM_CATEGORY_HARASSMENT
        threshold: BLOCK_ONLY_HIGH
      - category: HARM_CATEGORY_VIOLENCE
        threshold: BLOCK_MEDIUM_AND_ABOVE
```

See more details on Google's SafetySetting API [here](https://ai.google.dev/api/rest/v1/SafetySetting).

## Other configuration options

| Option            | Description                                                                                     | Default Value                        |
| ----------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------ |
| `apiKey`          | gcloud API token.                                                                               | None                                 |
| `apiHost`         | Full Google API host, e.g., for an LLM proxy.                                                   | `{region}-aiplatform.googleapis.com` |
| `projectId`       | gcloud project ID.                                                                              | None                                 |
| `region`          | gcloud region.                                                                                  | `us-central1`                        |
| `publisher`       | Model publisher.                                                                                | `google`                             |
| `context`         | Context for the model to consider when generating responses.                                    | None                                 |
| `examples`        | Examples to prime the model.                                                                    | None                                 |
| `safetySettings`  | [Safety settings](https://ai.google.dev/api/rest/v1/SafetySetting) to filter generated content. | None                                 |
| `stopSequence`    | Sequence of tokens that will stop the generation.                                               | None                                 |
| `temperature`     | Controls randomness. Lower values make the model more deterministic.                            | None                                 |
| `maxOutputTokens` | Maximum number of tokens to generate.                                                           | None                                 |
| `topP`            | Nucleus sampling: higher values cause the model to consider more candidates.                    | None                                 |
| `topK`            | Controls diversity via random sampling: lower values make sampling more deterministic.          | None                                 |

Note that not all models support all parameters. Please consult the [Google documentation](https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/overview) on how to use and format parameters.
