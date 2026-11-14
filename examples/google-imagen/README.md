# google-imagen (Gemini image generation)

Generate an image with Gemini and check that the response contains image data. The example keeps its original directory name for `init --example google-imagen`.

## Run with a Gemini API key

```bash
npx promptfoo@latest init --example google-imagen
cd google-imagen
export GOOGLE_API_KEY=your-api-key
npx promptfoo@latest eval
```

The default config sends one prompt to Nano Banana 2.1. To compare two models on that prompt, run `npx promptfoo@latest eval -c promptfooconfig-gemini.yaml`. For an image grounded with Google Search, use `promptfooconfig-gemini-grounding.yaml`. Check Google's [image generation guide](https://ai.google.dev/gemini-api/docs/image-generation) for supported resolutions and features.

## Run with Vertex AI

```bash
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT=your-project-id
npx promptfoo@latest eval -c promptfooconfig-advanced.yaml
```

The Vertex config calls Gemini 3.1 Flash Image in the EU multi-region with project credentials. Use `region: us` for the US multi-region or `region: global` for the global endpoint. The [Vertex model card](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-image) lists supported locations and [Vertex pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing) lists rates for each location.
