# google-video (Veo on Vertex AI)

Generate a video from a prompt or a starting image, or extend a previous Veo clip. Each configuration generates one video.

## Setup

Enable the Vertex AI API in a billing-enabled Google Cloud project with access to Veo in `us-central1`. Set up Application Default Credentials:

```bash
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT=your-project-id
npx promptfoo@latest init --example google-video
cd google-video
```

## Run the examples

```bash
# Text to video
npx promptfoo@latest eval

# Animate the included image
npx promptfoo@latest eval -c promptfooconfig-image.yaml
```

To extend a previously generated Veo clip, save its MP4 as `source.mp4` in this directory, then run:

```bash
npx promptfoo@latest eval -c promptfooconfig-extension.yaml
```

To keep the original in Cloud Storage, set `config.storageUri` to a writable `gs://bucket/prefix/` on generation. The exported response includes `metadata.sourceVideoUri`. You can use that URI as `config.sourceVideo` in the extension config.

Use the [Veo model card](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/veo/3-1-generate) for model IDs, regions, supported inputs, and output resolutions. On the Gemini Developer API, use [Gemini Omni](https://ai.google.dev/gemini-api/docs/video) for video generation.
