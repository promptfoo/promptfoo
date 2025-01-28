# Google Vertex

The `vertex` provider is compatible with Google's [Vertex AI](https://cloud.google.com/vertex-ai) offering, which offers access to models such as Gemini and Bison.

You can use it by specifying any of the available stable or latest [model versions](https://cloud.google.com/vertex-ai/docs/generative-ai/learn/model-versioning) offered by Vertex AI. These include:

- `vertex:chat-bison`
- `vertex:chat-bison@001`
- `vertex:chat-bison@002`
- `vertex:chat-bison-32k`
- `vertex:chat-bison-32k@001`
- `vertex:chat-bison-32k@002`
- `vertex:codechat-bison`
- `vertex:codechat-bison@001`
- `vertex:codechat-bison@002`
- `vertex:codechat-bison-32k`
- `vertex:codechat-bison-32k@001`
- `vertex:codechat-bison-32k@002`
- `vertex:gemini-pro`
- `vertex:gemini-ultra`
- `vertex:gemini-1.0-pro-vision`
- `vertex:gemini-1.0-pro-vision-001`
- `vertex:gemini-1.0-pro`
- `vertex:gemini-1.0-pro-001`
- `vertex:gemini-1.0-pro-002`
- `vertex:gemini-pro-vision`
- `vertex:gemini-1.5-pro-latest`
- `vertex:gemini-1.5-pro-preview-0409`
- `vertex:gemini-1.5-pro-preview-0514`
- `vertex:gemini-1.5-pro`
- `vertex:gemini-1.5-pro-001`
- `vertex:gemini-1.0-pro-vision-001`
- `vertex:gemini-1.5-flash-preview-0514`
- `vertex:gemini-1.5-flash-001`
- `vertex:aqa`

Embeddings models such as `vertex:embedding:text-embedding-004` are also supported.

:::tip
If you are using Google AI Studio, see the [`google` provider](/docs/providers/google).
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
- `VERTEX_API_VERSION` - API version to use, defaults to `v1`

The Vertex provider also supports various [configuration options](https://github.com/promptfoo/promptfoo/blob/main/src/providers/vertex.ts#L7-L22) such as context, examples, temperature, maxOutputTokens, and more, which can be used to customize the the behavior of the model like so:

```yaml
providers:
  - id: vertex:chat-bison-32k
    config:
      generationConfig:
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

See more details on Google's SafetySetting API [here](https://ai.google.dev/api/generate-content#safetysetting).

## Overriding graders

> **Note:** When Google credentials are configured and no OpenAI or Anthropic API keys are present, Vertex AI will be used as the default provider for operations like grading, suggestions, and dataset generation.

To use Vertex models for model grading (e.g. `llm-rubric` and `factuality` assertions), or to override the embeddings provider for the `similar` assertion, use `defaultTest` to override providers for all tests:

```yaml
defaultTest:
  options:
    provider:
      # Use gemini-pro for model-graded evals (e.g. assertions such as llm-rubric)
      text: vertex:chat:gemini-pro
      # Use vertex embeddings for similarity
      embedding: vertex:embedding:text-embedding-004
```

## Other configuration options

| Option                             | Description                                                                                              | Default Value                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `apiKey`                           | gcloud API token.                                                                                        | None                                 |
| `apiHost`                          | Full Google API host, e.g., for an LLM proxy.                                                            | `{region}-aiplatform.googleapis.com` |
| `apiVersion`                       | API version to use.                                                                                      | `v1`                                 |
| `projectId`                        | gcloud project ID.                                                                                       | None                                 |
| `region`                           | gcloud region.                                                                                           | `us-central1`                        |
| `publisher`                        | Model publisher.                                                                                         | `google`                             |
| `context`                          | Context for the model to consider when generating responses.                                             | None                                 |
| `examples`                         | Examples to prime the model.                                                                             | None                                 |
| `safetySettings`                   | [Safety settings](https://ai.google.dev/api/generate-content#safetysetting) to filter generated content. | None                                 |
| `generationConfig.temperature`     | Controls randomness. Lower values make the model more deterministic.                                     | None                                 |
| `generationConfig.maxOutputTokens` | Maximum number of tokens to generate.                                                                    | None                                 |
| `generationConfig.topP`            | Nucleus sampling: higher values cause the model to consider more candidates.                             | None                                 |
| `generationConfig.topK`            | Controls diversity via random sampling: lower values make sampling more deterministic.                   | None                                 |
| `generationConfig.stopSequences`   | Set of string outputs that will stop output generation.                                                  | []                                   |
| `toolConfig`                       | Configuration for tool usage                                                                             | None                                 |
| `systemInstruction`                | System prompt. Nunjucks template variables `{{var}}` are supported                                       | None                                 |

Note that not all models support all parameters. Please consult the [Google documentation](https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/overview) on how to use and format parameters.

## Troubleshooting

### `gcloud` reauth related errors

If you get an error that looks like this:

```
API call error: Error: {"error":"invalid_grant","error_description":"reauth related error (invalid_rapt)","error_uri":"https://support.google.com/a/answer/9368756","error_subtype":"invalid_rapt"}
```

This is due to an authentication issue. You can fix this by running:

```sh
gcloud auth application-default login
```
