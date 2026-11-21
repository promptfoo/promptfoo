# google-aistudio-gemini (Gemini and Gemma)

Compare Gemini and Gemma on the same arithmetic question. The Gemini configuration loads a system instruction from a file. Both answers are graded locally against the expected number.

## Run the eval

Set `GOOGLE_API_KEY` or `GEMINI_API_KEY` to a [Gemini API key](https://ai.google.dev/gemini-api/docs/api-key), then run:

```sh
npx promptfoo@latest init --example google-aistudio-gemini
cd google-aistudio-gemini
npx promptfoo@latest eval
```

To compare the two bundled photos, run `npx promptfoo@latest eval -c promptfooconfig.image.yaml`.

To try other models, change the provider IDs and check which APIs they support. [Gemini models](https://ai.google.dev/gemini-api/docs/models) · [Hosted Gemma models](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api)
