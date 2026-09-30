# multimodal-output-grading (Grade generated images)

This example asks for red and blue bicycles and grades both against the same red-bicycle rubric.
It uses OpenAI for image generation and grading and requires `OPENAI_API_KEY`.

## Run the example

```bash
npx promptfoo@latest init --example multimodal-output-grading
cd multimodal-output-grading
npx promptfoo@latest eval --no-cache --no-share
```

The red bicycle should pass and the blue bicycle should fail. Inspect the generated images alongside
the grades; model outputs can vary.

`llm-rubric` attaches the image bytes to the vision grader and keeps a placeholder in the grading
prompt text. Images externalized to Promptfoo's blob store are resolved for the grading request;
the saved response retains its blob reference. Inline media settings can instead retain the image
bytes in the saved response.

To use another vision model, set `defaultTest.options.provider`. The chosen provider receives the
image bytes. See the [image grading documentation](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/llm-rubric/#grading-image-multimodal-outputs)
for supported formats and size limits. Remote HTTP image URLs are not supported.
