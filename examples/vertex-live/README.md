# vertex-live (Vertex Live API)

Grade spoken-response transcripts from Gemini Live on Google Cloud.

## Run

Use a Google Cloud project with the Vertex AI API enabled and permission to call the model:

```bash
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT=your-project-id
npx promptfoo@latest init --example vertex-live
cd vertex-live
npx promptfoo@latest eval --no-cache -j 1
```

This example uses `gemini-live-2.5-flash-native-audio` in `us-central1`. Authentication uses Google Cloud OAuth; Gemini API keys do not apply. The provider returns audio and a transcript in `output.text`.

See the [Vertex Live docs](https://www.promptfoo.dev/docs/providers/vertex/#live-api) for other locations, tools, and Gemini 3.8 Live availability. For Gemini 3.8 through the Gemini API, use the `google-live` example.
