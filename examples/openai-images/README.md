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

## Grade each image

Use a vision-capable grader to check whether each photo shows the requested product. Keep images inline so the grader receives their bytes. This runs two additional model calls.

```sh
PROMPTFOO_INLINE_MEDIA=true npx promptfoo@latest eval -c promptfooconfig.judge.yaml
```

See the [image evaluation guide](https://www.promptfoo.dev/docs/guides/image-evaluation/) for supported image formats and custom rubric prompts.
