# google-vertex (Google Vertex AI Examples)

The default eval uses Gemini to route support messages and checks the returned labels locally. The other configurations cover tool calls, images, search grounding, structured output, and partner models.

## Run the eval

Enable the Vertex AI API for your project and use an account with permission to invoke the selected model. For local development, sign in with Application Default Credentials:

```sh
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT=your-project-id
npx promptfoo@latest init --example google-vertex
cd google-vertex
npx promptfoo@latest eval
```

If you already use a service account, you can set `GOOGLE_APPLICATION_CREDENTIALS` to its credentials file. The Gemini text examples set `expressMode: false` to use your project credentials even when a Gemini API key is present.

## Other configurations

Run `npx promptfoo@latest eval -c <filename>` to select a configuration.

| File                                   | What it evaluates                                      |
| -------------------------------------- | ------------------------------------------------------ |
| `promptfooconfig.gemini.yaml`          | The tool Gemini selects and the airport code it passes |
| `promptfooconfig.search.yaml`          | Responses grounded in Google Search                    |
| `promptfooconfig.image.yaml`           | Image understanding                                    |
| `promptfooconfig.response-schema.yaml` | Structured JSON output                                 |
| `promptfooconfig.claude.yaml`          | Code review with Claude                                |
| `promptfooconfig.llama.yaml`           | Llama on Model Garden                                  |

Model IDs, access requirements, and supported locations vary by model. [Vertex provider guide](https://www.promptfoo.dev/docs/providers/vertex/) · [Google Cloud model lifecycle](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/model-versions)
