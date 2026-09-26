# openai-vision (OpenAI Vision Model Example)

This example sends text and a local image to GPT-6 Sol through the Responses API, then checks whether the description identifies Earth.

## Usage

```bash
npx promptfoo@latest init --example openai-vision
cd openai-vision
export OPENAI_API_KEY=your-key-here
npx promptfoo@latest eval --no-cache
```

To load the key from a `.env` file instead, add `--env-file .env` to the evaluation command.

`prompt.json` combines `input_text` and `input_image` content. `file://assets/earth.txt` loads the bundled image data URL. Change the question, image source, and assertion in `promptfooconfig.yaml` to test another image. You can also use an HTTPS image URL that is accessible to OpenAI.

The bundled image is NASA's [Blue Marble photograph from Apollo 17](https://www.nasa.gov/image-article/blue-marble-image-of-earth-from-apollo-17/).

See the [image input documentation](https://www.promptfoo.dev/docs/providers/openai/#sending-images-in-prompts) for more options.
