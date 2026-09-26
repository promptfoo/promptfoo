# openai-vision (OpenAI Vision Model Example)

This example sends text and an image URL to GPT-6 Sol through the Responses API, then checks whether the description mentions a boardwalk.

```bash
npx promptfoo@latest init --example openai-vision
cd openai-vision
export OPENAI_API_KEY=your-key-here
npx promptfoo@latest eval --no-cache
```

To load the key from a `.env` file instead, add `--env-file .env` to the evaluation command.

`prompt.json` combines `input_text` and `input_image` content. Change the question and image URL in `promptfooconfig.yaml` to test other images. The image URL must be accessible to OpenAI.

See the [image input documentation](https://www.promptfoo.dev/docs/providers/openai/#sending-images-in-prompts) for more options.
