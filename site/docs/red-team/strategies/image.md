---
sidebar_label: Image Inputs
---

# Image Jailbreaking

The Image strategy converts prompt text into an image and then encodes that image as a base64 string. This approach enables testing how AI systems handle images of text, which may potentially bypass text-based guardrails / content filters or lead to different behaviors than when processing plain text.

## Why Use This Strategy

This strategy helps security researchers and AI developers:

1. **Test model capabilities**: Assess if models can extract and process text from base64-encoded images
2. **Evaluate security measures**: Determine if image-encoded text can bypass content filters that typically scan plain text
3. **Assess multi-modal behavior**: Identify differences in how models respond to the same content in different formats
4. **Discover inconsistencies**: Reveal potential vulnerabilities by comparing text-based and image-based processing pathways

## How It Works

The strategy performs the following operations:

1. Takes the original text from your test case
2. Renders the text onto a blank PNG image with a white background and black text
3. Converts the PNG image to a base64 string
4. Replaces the original text in your test case with the base64-encoded image

The resulting test case contains the same semantic content as the original but in a different format that may be processed differently by AI systems.

## Text-to-Image Conversion Example

Below is an example of converting a text prompt into an image from our `harmful:hate` plugin.

![Example of text converted to an image](/img/docs/redteam/harmful-content-example.png)

After encoding, this image is converted to base64, which begins like:

```
iVBORw0KGgoAAAANSUhEUgAAA...
```

## Implementation

Use it in your promptfooconfig.yaml like this:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Multi-modal redteam'
targets:
  - bedrock:amazon.nova-lite-v1:0
prompts:
  - file://path/to/your/prompt.json
redteam:
  plugins:
    - ...
  strategies:
    - image
    - id: basic
      config:
        enabled: false
```

:::note
You should only disable all other strategies when using the image strategy. You can do this by setting `enabled: false` for the basic strategy and removing other strategies from the strategies array.
:::

Your prompt.json file should look like this:

```json title="prompt.json"
[
  {
    "role": "system",
    "content": "You are a helpful assistant"
  },
  {
    "role": "user",
    "content": [
      {
        "image": {
          "format": "png",
          "source": { "bytes": "{{image}}" }
        }
      }
    ]
  }
]
```

:::note
You should update the prompt.json to match the prompt format of your LLM provider. Base64 images are all encoded as PNG images.
:::

:::note
The `{{image}}` syntax in the examples is a Nunjucks template variable. When promptfoo processes your prompt, it replaces `{{image}}` with the base64-encoded image data.
:::

:::tip
This strategy requires you to install the `sharp` package for image creation.

```
npm i sharp
```

:::

## Related Concepts

- [Audio Jailbreaking](/docs/red-team/strategies/audio.md) - Similar approach using speech audio instead of images

For a comprehensive overview of LLM vulnerabilities and red teaming strategies, visit our [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) page.
