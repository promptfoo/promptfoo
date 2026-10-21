---
sidebar_label: LSB Image Stego
title: LSB Image Steganography Strategy
description: Evaluate multimodal model handling of UTF-8 text embedded in the least significant bits of lossless PNG images
---

# LSB Image Steganography Strategy

The `image-stego` strategy encodes prompt text into the least significant bits (LSBs) of a lossless PNG image and replaces the prompt variable with the base64-encoded PNG. Unlike the `image` strategy, which renders text visibly onto a canvas, `image-stego` embeds the UTF-8 payload at the pixel channel level.

## How It Works

1. Reads the original text from the target `injectVar` in each test case
2. Appends an end-of-payload sentinel (`====EOF====` by default) to the UTF-8 bytes
3. Generates a synthetic solid-color carrier image (minimum `64x64`, auto-sized when the payload requires more capacity)
4. Writes the framed payload bits MSB-first into the least significant bit of each channel (`RGBA` or `RGB`), changing any channel value by at most `1`
5. Encodes the image as a lossless PNG in base64 and sets `metadata.strategyId = 'image-stego'` and `metadata.originalText`

A companion `decodeLsbPng` helper is exported from `src/redteam/strategies/lsbStego.ts` for test verification.

## Implementation

Use it in your `promptfooconfig.yaml`:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Multimodal LSB stego evaluation'
targets:
  - openai:gpt-4o
prompts:
  - file://path/to/your/prompt.json
redteam:
  plugins:
    - ...
  strategies:
    - id: image-stego
      config:
        channels: RGBA
        delimiter: '====EOF===='
```

:::tip
This strategy requires the `sharp` package for lossless PNG encoding:

```bash
npm i sharp
```

:::

## Related Concepts

- [Image Inputs](image.md)
- [Base64 Encoding](base64.md)
- [Red Team Strategies](/docs/red-team/strategies/)
