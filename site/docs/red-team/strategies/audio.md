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

:::tip
This strategy requires you to install `node-gtts` for text-to-speech conversion:

```
npm i node-gtts
```

:::

## How It Works

The strategy performs the following operations:

1. Takes the original text from your test case
2. Converts the text into speech using Google's Text-to-Speech service
3. Encodes the MP3 audio as a base64 string
4. Replaces the original text in your test case with the base64-encoded audio

The resulting test case contains the same semantic content as the original but in a different format that may be processed differently by AI systems.

## Importance

This strategy is worth implementing because:

1. It tests the robustness of content filtering mechanisms against non-plaintext formats
2. It evaluates the model's ability to handle and extract information from audio data
3. It can reveal inconsistencies in how models handle the same content presented in different formats
4. Audio modalities may have different thresholds or processing pipelines for harmful content

For a comprehensive overview of LLM vulnerabilities and red teaming strategies, visit our [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) page.
