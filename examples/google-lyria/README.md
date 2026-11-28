# google-lyria (Google Lyria Music Generation)

Generate music with Google's Lyria models through the Gemini API. `lyria-3-clip-preview` always returns a 30-second clip; `lyria-3.5` returns a full-length song and also accepts images as inspiration. Both return 44.1 kHz stereo MP3 audio, which plays in the web viewer, and the generated lyrics as the text output. Instrumental tracks return `<instrumental>` instead of lyrics.

## Run the example

```bash
npx promptfoo@latest init --example google-lyria
cd google-lyria
export GEMINI_API_KEY=your_api_key
npx promptfoo@latest eval
npx promptfoo@latest view
```

Lyria is available only on the paid tier. This example generates two songs, which cost $0.12 at Google's [published per-song prices](https://ai.google.dev/gemini-api/docs/pricing#lyria-3-5). The `llm-rubric` assertion grades the lyrics with your default grading provider.

Lyria interprets the prompt for genre, instruments, tempo, structure, and duration, and accepts custom lyrics with section tags such as `[Verse]` and `[Chorus]`. See the [Google provider documentation](https://www.promptfoo.dev/docs/providers/google/#music-generation) and Google's [Lyria prompt guide](https://ai.google.dev/gemini-api/docs/lyria-prompt-guide).
