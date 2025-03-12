---
sidebar_label: Image Inputs
---

# Image Jailbreaking

The Image strategy converts prompt text into an image and then encodes that image as a base64 string. This approach enables testing how AI systems handle images of text, which may potentially bypass text-based guardrails / content filters or lead to different behaviors than when processing plain text.

## Use Case

This strategy is useful for:

1. Testing if models can extract and process text from base64-encoded images
2. Evaluating if image-encoded text can bypass content filters that typically scan plain text
3. Assessing model behavior when handling multi-modal inputs (text embedded in an image format)

## How It Works

The strategy performs the following operations:

1. Takes the original text from your test case
2. Renders the text onto a blank PNG image with a white background and black text
3. Converts the PNG image to a base64 string
4. Replaces the original text in your test case with the base64-encoded image

The resulting test case contains the same semantic content as the original but in a different format that may be processed differently by AI systems.

## Implementation

Use it in your promptfooconfig.yaml like this:

```yaml title="promptfooconfig.yaml"
targets:
  - bedrock:amazon.nova-lite-v1:0
prompts:
  - file://path/to/your/prompt.json
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

:::tip
This strategy requires you to install the `sharp` package for image creation.

```
npm i sharp
```

:::

## Importance

This strategy is valuable because:

1. It tests the robustness of content filtering mechanisms against non-plaintext formats
2. It evaluates the model's ability to handle and extract information from encoded data
3. It can reveal inconsistencies in how models handle the same content presented in different formats

For a comprehensive overview of LLM vulnerabilities and red teaming strategies, visit our [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) page.
