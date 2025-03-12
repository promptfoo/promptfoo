---
sidebar_label: Image Inputs
---

# Image Jailbreaking

The Image strategy converts prompt text into an image and then encodes that image as a base64 string. This allows for testing how AI systems handle image-encoded text, which may potentially bypass text-based content filters or lead to different behaviors than when processing plain text.

## Use Case

This strategy is useful for:

1. Testing if models can extract and process text from base64-encoded images
2. Evaluating if image-encoded text can bypass content filters that typically scan plain text
3. Assessing model behavior when handling multi-modal inputs (text embedded in an image format)

Use it like so in your promptfooconfig.yaml:

```yaml
strategies:
  - image
```

:::tip
This strategy requires you to install `sharp` for image creation:

```
npm i sharp
```

:::

## How It Works

The strategy performs the following operations:

1. Takes the original text from your test case
2. Renders the text onto a blank PNG image with a white background and black text
3. Converts the PNG image to a base64 string
4. Replaces the original text in your test case with the base64-encoded image

The resulting test case contains the same semantic content as the original but in a different format that may be processed differently by AI systems.

## Importance

This strategy is worth implementing because:

1. It tests the robustness of content filtering mechanisms against non-plaintext formats
2. It evaluates the model's ability to handle and extract information from encoded data
3. It can reveal inconsistencies in how models handle the same content presented in different formats

For a comprehensive overview of LLM vulnerabilities and red teaming strategies, visit our [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) page.
