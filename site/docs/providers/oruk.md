---
title: Oruk
sidebar_label: Oruk
description: Configure Oruk Fourier 2B English speech-to-text transcription in Promptfoo using the OpenAI-compatible transcription provider, custom base URL, and WER evals.
---

# Oruk

[Oruk](https://oruk.ai) serves the Fourier 2B English speech-to-text model through an OpenAI-compatible `/v1/audio/transcriptions` endpoint. Use Promptfoo's [OpenAI transcription provider](/docs/providers/openai/#audio-transcription) pointed at Oruk's endpoint and API key.

## Setup

Create an API key from [Oruk](https://oruk.ai) and set `ORUK_API_KEY` in your shell, or load it from a file with `--env-file`:

```bash
export ORUK_API_KEY=your_api_key_here
```

Then configure the `openai:transcription:oruk-fourier-2b` provider in your `promptfooconfig.yaml`:

```yaml
prompts:
  - '{{audio_file}}'

providers:
  - id: openai:transcription:oruk-fourier-2b
    label: Oruk Fourier 2B
    config:
      apiBaseUrl: https://speech-api.oruk.ai/v1
      apiKeyEnvar: ORUK_API_KEY
      language: en
      headers:
        OpenAI-Organization: ''
```

`apiBaseUrl` overrides OpenAI endpoint environment variables. `apiKeyEnvar` reads only `ORUK_API_KEY`; a missing key does not fall back to `OPENAI_API_KEY`. The empty `OpenAI-Organization` header overrides any inherited `OPENAI_ORGANIZATION` value.

## Model Details

| Model             | Languages                        | Limits                | Hosted API Rate |
| ----------------- | -------------------------------- | --------------------- | --------------- |
| `oruk-fourier-2b` | English (`en`, `en-US`, `en-GB`) | Up to 30 MiB / 60 min | $0.0080/minute  |

## Configuration

- `language` - Optional English language hint (`en`, `en-US`, or `en-GB`). Omitting `language` defaults to English.
- Promptfoo requests `verbose_json` for non-`gpt-4o-*` transcription models, which Oruk supports alongside `json` and `text`.
- Oruk's `/v1/audio/transcriptions` endpoint enforces strict request validation and rejects unknown fields. Omit `prompt`, `temperature`, `timestamp_granularities`, `chunking_strategy`, and speaker diarization fields (`known_speaker_names`, `known_speaker_references`).
- For self-hosted deployments using the open-weight [oruk/oruk-fourier-2b](https://huggingface.co/oruk/oruk-fourier-2b) checkpoint (2.04B parameters, licensed under `CC BY-NC 4.0`; the hosted API carries no non-commercial restriction), point `apiBaseUrl` at your OpenAI-compatible transcription server.

## Example: Comparing Transcription Accuracy (WER)

The example below compares Oruk Fourier 2B against OpenAI's `gpt-4o-transcribe` on the same audio file using a bounded-memory JavaScript Word Error Rate (WER) assertion:

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Compare English speech-to-text transcription accuracy

prompts:
  - '{{audio_file}}'

providers:
  - id: openai:transcription:oruk-fourier-2b
    label: Oruk Fourier 2B
    config:
      apiBaseUrl: https://speech-api.oruk.ai/v1
      apiKeyEnvar: ORUK_API_KEY
      language: en
      headers:
        OpenAI-Organization: ''

  - id: openai:transcription:gpt-4o-transcribe
    label: OpenAI GPT-4o Transcribe
    config:
      language: en

tests:
  - vars:
      audio_file: sample-audio.mp3
      reference: That's one small step for man, one giant leap for mankind.
    assert:
      - type: icontains
        value: small step
      - type: icontains
        value: mankind
      - type: javascript
        metric: wer_pass
        value: |
          const normalize = (s) =>
            String(s || '')
              .toLowerCase()
              .replace(/[^a-z0-9'\s]/g, ' ')
              .trim()
              .split(/\s+/)
              .filter(Boolean);
          const ref = normalize(context.vars.reference);
          const hyp = normalize(output);
          let prev = Array.from({ length: hyp.length + 1 }, (_, j) => j);
          let curr = new Array(hyp.length + 1).fill(0);
          for (let i = 1; i <= ref.length; i++) {
            curr[0] = i;
            for (let j = 1; j <= hyp.length; j++) {
              const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
              curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
            }
            [prev, curr] = [curr, prev];
          }
          const edits = prev[hyp.length];
          const wer = ref.length ? edits / ref.length : 0;
          return {
            pass: wer <= 0.15,
            score: Math.max(0, 1 - wer),
            reason: `WER ${(wer * 100).toFixed(1)}% (${edits}/${ref.length} edits)`,
          };
```

## Example

The self-contained [provider-oruk example](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-oruk) ships a sample audio clip and evaluates Oruk Fourier 2B with phrase and Word Error Rate assertions using only `ORUK_API_KEY`.

## See Also

- [OpenAI Provider](/docs/providers/openai/) - Built-in transcription provider used by Oruk
- [Configuration Reference](/docs/configuration/reference.md) - Full provider configuration options
- [Oruk Fourier 2B on Hugging Face](https://huggingface.co/oruk/oruk-fourier-2b) - Open weights and model card
