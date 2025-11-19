---
sidebar_label: Audio Inputs
title: Audio Jailbreaking Strategy
description: Assess multimodal AI vulnerabilities using audio-encoded text attacks to circumvent content moderation and safety filters
---

# Audio Jailbreaking

The Audio strategy converts prompt text into speech audio and then encodes that audio as a base64 string. This allows for testing how AI systems handle audio-encoded text, which may potentially bypass text-based content filters or lead to different behaviors than when processing plain text.

## Use Case

This strategy is useful for:

1. Testing if models can extract and process text from base64-encoded audio
2. Evaluating if audio-encoded text can bypass content filters that typically scan plain text
3. Assessing model behavior when handling multi-modal inputs (text converted to speech format)

Use it like so in your promptfooconfig.yaml:

```yaml title="promptfooconfig.yaml"
strategies:
  - audio
```

Or with additional configuration:

```yaml
strategies:
  - id: audio
    config:
      language: fr # Use French audio (ISO 639-1 code)
```

:::warning

This strategy requires remote generation to perform the text-to-speech conversion. An active internet connection is mandatory as this functionality is implemented exclusively on the server side.

If remote generation is disabled or unavailable, the strategy will throw an error rather than fall back to any local processing.

:::

## How It Works

The strategy performs the following operations:

1. Takes the original text from your test case
2. Sends the text to the remote service for conversion to speech audio
3. Receives the base64-encoded audio data
4. Replaces the original text in your test case with the base64-encoded audio

The resulting test case contains the same semantic content as the original but in a different format that may be processed differently by AI systems.

## Configuration Options

- `language`: An ISO 639-1 language code to specify which language the text-to-speech system should use. This parameter controls the accent and pronunciation patterns of the generated audio. **Defaults to 'en' (English)** if not specified. Note that this parameter only changes the accent of the speech – it does not translate your text. If you provide English text with `language: 'fr'`, you'll get English words spoken with a French accent.

## Importance

This strategy is worth implementing because:

1. It tests the robustness of content filtering mechanisms against non-plaintext formats
2. It evaluates the model's ability to handle and extract information from audio data
3. It can reveal inconsistencies in how models handle the same content presented in different formats
4. Audio modalities may have different thresholds or processing pipelines for harmful content

## Related Concepts

- [Image Jailbreaking](/docs/red-team/strategies/image) - Similar approach using images instead of audio
- [Video Jailbreaking](/docs/red-team/strategies/video) - Similar approach using video instead of audio
- [Multi-Modal Red Teaming Guide](/docs/guides/multimodal-red-team) - Comprehensive guide for testing multi-modal models
- [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) - Comprehensive overview of vulnerabilities
- [Red Teaming Strategies](/docs/red-team/strategies) - Other red teaming approaches
