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

The provider authenticates with Google Cloud OAuth and returns a spoken answer with its transcript in `output.text`. Set `VERTEX_REGION` to select a supported location.

See the [Vertex Live docs](https://www.promptfoo.dev/docs/providers/vertex/#live-api) for configuration and model availability.
