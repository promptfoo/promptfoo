# redteam-multi-modal (Multi-Modal Red Team Testing)

This example demonstrates how to use promptfoo's red teaming capabilities with multi-modal models, showing two different approaches to testing model safety and robustness against adversarial inputs involving images.

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-multi-modal
```

## Quick Start

1. Install dependencies:

   ```bash
   npm install promptfoo sharp
   ```

2. Set up environment variables (see next section)
3. Run the static image example:

   ```bash
   npx promptfoo@latest redteam eval -c redteam.static-image.yaml
   ```

4. Run the image strategy example:

   ```bash
   npx promptfoo@latest redteam eval -c redteam.image-strategy.yaml
   ```

5. Review results in the promptfoo interface

## Environment Variables

This example requires the following environment variables:

- `AWS_ACCESS_KEY_ID` - Your AWS access key for Amazon Bedrock
- `AWS_SECRET_ACCESS_KEY` - Your AWS secret key for Amazon Bedrock
- `AWS_REGION` - Your AWS region (e.g., `us-east-1`)

You can set these in a `.env` file or directly in your environment.

## Description

This example provides two different approaches to red team testing with multi-modal models:

### 1. Static Image Example (`promptfooconfig.static-image.yaml`)

This configuration demonstrates how to red team a multi-modal model by keeping a static image (in this example, Buzz Aldrin on the moon) constant while varying the text prompt to test different potential attack vectors. The adversarial prompts are injected into the `question` variable.

Key features:

- Uses a fixed image (aldrin_apollo_11.jpg) for all tests
- Varies the text prompts using various harmful content plugins
- Tests how the model handles potentially harmful requests in the context of image analysis

### 2. Image Strategy Example (`promptfooconfig.image-strategy.yaml`)

This configuration demonstrates how to use promptfoo's image strategy for red teaming. Instead of attacking through text prompts, this approach converts potentially harmful text into images (text-to-image) and then sends those images to the model. This can help identify if models process text differently when it's embedded in an image rather than presented as plain text.

Key features:

- Keeps the text prompt constant ("Please answer the question in the image" - you can change this to any prompt or remove it entirely)
- Converts harmful text content into images using the image strategy
- Tests if harmful content embedded in images can bypass model safety filters

## How It Works: Understanding Variables and Injection

In both examples, we work with prompt templates that have multiple variables:

- The static image example uses variables for both `image` and `question`
- The image strategy example uses these same variables but injects content differently

A crucial concept in these examples is that **red teaming injects content into only one variable at a time** (specified by `injectVar` in the config). The remaining variables need default values, which are set in the `defaultTest` section:

```yaml
defaultTest:
  vars:
    # For static image example:
    image: file://aldrin_apollo_11.jpg # Fixed image while question varies

    # For image strategy example:
    question: 'Please answer the question in the image' # Fixed text while image varies
```

This approach lets you precisely control which part of your prompt receives adversarial content, while keeping other elements constant across all tests.

### Static Image Configuration

The static image example uses a fixed JPEG image with adversarial text prompts injected into the conversation. The image remains constant while the text varies based on the redteam plugins.

### Image Strategy Configuration

The image strategy converts text into images that are then encoded as base64 strings:

1. Takes potentially harmful text content
2. Renders it as black text on a white background in PNG format
3. Encodes the image as a base64 string
4. Passes this encoded image to the model instead of plain text

This approach can reveal whether models process text differently when it's embedded in images versus presented as plain text.

Important notes about the image strategy:

- It always produces PNG images when converting text to images
- The converted text appears as black text on a white background
- The strategy ensures the text is clearly readable in the generated image

## How to Run

### Running the Static Image Example

```bash
npx promptfoo@latest redteam eval -c redteam.static-image.yaml
```

### Running the Image Strategy Example

```bash
npm install sharp # Required for the image strategy
npx promptfoo@latest redteam eval -c redteam.image-strategy.yaml
```

## Additional Configuration Options

### Purpose Statement

When configuring your redteam tests, ensure that the `purpose` statement in your configuration is relevant to the image content in some way. This helps create more realistic and contextually appropriate test scenarios.

For example, in the static image example, the purpose statement references NASA and Buzz Aldrin, which is directly relevant to the moon landing image:

```yaml
redteam:
  purpose: >-
    You are a helpful assistant for NASA that can answer questions about this photo of Buzz Aldrin on the moon.
```

For more information on how the image strategy works, refer to the [Image Inputs strategy documentation](https://promptfoo.dev/docs/red-team/strategies/image).

## Supported Models

This example uses Amazon Bedrock's Nova model by default:

```yaml
targets:
  - id: bedrock:amazon.nova-lite-v1:0
    label: multimodal-model
```

However, the techniques demonstrated can be applied to any multi-modal model that supports image inputs. You can easily swap out the target model in the configuration files to use models from:

- **OpenAI**: `openai:gpt-4o-mini` and newer versions that support vision
- **Anthropic**: Claude 3 models with vision capabilities
- **Google**: Gemini models
- **Other providers**: Any model that can process both text and image inputs

To use a different model, simply update the `targets` section in your configuration file. The prompt format may need to be adjusted to match the requirements of your chosen model.

For example, to use OpenAI's GPT-4o:

```yaml
targets:
  - id: openai:gpt-4o
    label: gpt4o-vision
```

Note you may have to update the prompt format to match the requirements of your chosen model.

## Next Steps

After running these examples, consider:

1. **Customizing plugins**: Add or modify red team plugins to test specific vulnerabilities
2. **Creating your own images**: Test with domain-specific images relevant to your use case
3. **Cross-model comparison**: Compare how different models handle the same red team attacks
4. **Enhancing safety measures**: Apply lessons learned to improve your model's safety mechanisms

## Troubleshooting

### Common Issues

- **Sharp installation problems**: If you encounter issues installing the Sharp library, check the [Sharp installation guide](https://sharp.pixelplumbing.com/install)
- **Image encoding errors**: Ensure your image paths are correct and image files are valid
- **API rate limits**: Be mindful of your model provider's rate limits when running multiple tests
