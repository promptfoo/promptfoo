---
sidebar_label: Audio Inputs
---

# Audio Jailbreaking

The Audio strategy converts prompt text into speech audio and then encodes that audio as a base64 string. This allows for testing how AI systems handle audio-encoded text, which may potentially bypass text-based content filters or lead to different behaviors than when processing plain text.

## Use Case

This strategy is useful for:

1. Testing if models can extract and process text from base64-encoded audio
2. Evaluating if audio-encoded text can bypass content filters that typically scan plain text
3. Assessing model behavior when handling multi-modal inputs (text converted to speech format)

Use it like so in your promptfooconfig.yaml:

```yaml
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

:::note
This strategy uses Promptfoo Cloud to perform the text-to-speech conversion. It requires an active internet connection and works automatically when using the hosted version or with Cloud credentials.
:::

## How It Works

The strategy performs the following operations:

1. Takes the original text from your test case
2. Sends the text to a remote service for conversion to speech audio
3. Receives the base64-encoded audio data
4. Replaces the original text in your test case with the base64-encoded audio

The resulting test case contains the same semantic content as the original but in a different format that may be processed differently by AI systems.

## Configuration Options

- `language`: An ISO 639-1 language code (e.g., 'en', 'fr', 'es') to specify which language the text-to-speech system should use. Defaults to 'en' (English).

## Importance

This strategy is worth implementing because:

1. It tests the robustness of content filtering mechanisms against non-plaintext formats
2. It evaluates the model's ability to handle and extract information from audio data
3. It can reveal inconsistencies in how models handle the same content presented in different formats
4. Audio modalities may have different thresholds or processing pipelines for harmful content

For a comprehensive overview of LLM vulnerabilities and red teaming strategies, visit our [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) page.
