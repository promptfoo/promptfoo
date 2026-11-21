# openai-images (Compare image prompts)

Generate two product photos of the same mug with the default OpenAI image provider. Compare the results to see how specifying the background, camera angle, and lighting changes the image.

## Run

With `OPENAI_API_KEY` set in your shell, run these commands.

```sh
npx promptfoo@latest init --example openai-images
cd openai-images
npx promptfoo@latest eval
npx promptfoo@latest view
```

Change the `product` test variable in `promptfooconfig.yaml` to try the comparison on your own product. For model selection, animated GIFs, SVGs, and image edits, see the [OpenAI image provider guide](https://www.promptfoo.dev/docs/providers/openai/#generating-images).
