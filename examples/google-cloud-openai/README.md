# google-cloud-openai (OpenAI on Google Cloud)

Evaluate an OpenAI model through Google Cloud's Responses API. This requires an approved private preview project and a model enabled for that project.

## Setup

Initialize the example:

```sh
npx promptfoo@latest init --example google-cloud-openai
```

Set up Google Application Default Credentials and select your project:

```sh
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT=your-google-cloud-project
```

In `promptfooconfig.yaml`, replace `gpt-6-luna` with the exact model ID enabled for your project. If onboarding supplied a different endpoint, add `config.apiBaseUrl` with its base URL before `/responses`. Google OAuth credentials are refreshed automatically; an OpenAI or Gemini API key is not used.

## Run the eval

```sh
npx promptfoo@latest eval --no-cache -o results.json
```

When working from the Promptfoo repository, run from the repository root:

```sh
npm run local -- eval -c examples/google-cloud-openai/promptfooconfig.yaml --no-cache -o results.json
```

Inspect the exported results for outputs, assertion success, token usage, and errors. A 403 can indicate missing project permissions or preview access; check these with your Google Cloud account team. Feature availability depends on the preview endpoint. This example uses deterministic assertions and does not require a separate grading model.

See [Vertex provider configuration](https://www.promptfoo.dev/docs/providers/vertex/#openai-models-private-preview) for credential options and custom token prices.
