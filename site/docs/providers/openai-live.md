---
title: OpenAI GPT-Live
description: Test GPT-Live voice conversations with paced audio input, timestamped transcripts, recorded responses, backend delegation, and separate voice usage accounting.
---

# OpenAI GPT-Live

Use `openai:live:gpt-live-1` to evaluate [OpenAI's GPT-Live API](https://developers.openai.com/api/docs/guides/live). It connects to `/v1/live/sessions` and supports full-duplex audio, where the model can listen and speak simultaneously. `openai:gpt-live-1` and `openai:live` select the same provider, and dated `openai:gpt-live-*` snapshots also use it.

Set `OPENAI_API_KEY` to an OpenAI project key with Live access. For a compatible gateway, set `apiBaseUrl` and authenticate with `apiKey` or a credential header in `headers`, such as `Authorization` or `api-key`.

## Quickstart

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: GPT-Live spoken answers
prompts:
  - 'What is the capital of France? Answer in one sentence.'
providers:
  - id: openai:live:gpt-live-1
    config:
      instructions: Keep answers short. Delegate questions needing research to the backend.
      audio:
        output:
          voice: marin
      responseWindowMs: 30000
      delegation:
        type: responses
        responses:
          model: gpt-5.6-luna
          instructions: Return concise, factual answers.
tests:
  - assert:
      - type: contains
        value: Paris
```

Run `npx promptfoo@latest eval --no-cache -o results.json`. Assertions evaluate the assistant's transcript. The result also includes playable audio and timestamped user and assistant transcript fragments. Fragments keep their original spacing, so a transcript can begin with a space; prefer `contains` or `icontains` to `equals`.

Each test creates a new session. Text prompts seed a user message in startup history, then request a spoken answer while streaming silence. This is useful for checking answer content; use recorded audio to evaluate speech recognition, pauses, or interruptions.

## Audio input

Use OpenAI chat-format audio content in your prompt:

```json
[
  {
    "role": "user",
    "content": [
      {
        "type": "input_audio",
        "input_audio": { "data": "{{audio}}", "format": "wav" }
      }
    ]
  }
]
```

Set the `audio` test variable to `file://sample.wav`. WAV files must contain mono, signed 16-bit PCM matching `audio.format.rate` (24,000 Hz by default). Promptfoo removes the WAV container before streaming. It accepts streaming headers with unknown sizes, such as OpenAI text-to-speech `wav` output and ffmpeg pipe output, and `WAVE_FORMAT_EXTENSIBLE` PCM. It rejects mismatched rates and compressed formats; it does not resample audio.

Raw base64 audio accepts `pcm16`, `g711_ulaw`, or `g711_alaw` in `input_audio.format`. Configure the corresponding shared input/output format:

| `audio.format`                   | Input encoding            |
| -------------------------------- | ------------------------- |
| `{type: audio/pcm, rate: 24000}` | `pcm16` or matching `wav` |
| `{type: audio/pcm, rate: 16000}` | `pcm16` or matching `wav` |
| `{type: audio/pcmu, rate: 8000}` | `g711_ulaw`               |
| `{type: audio/pcma, rate: 8000}` | `g711_alaw`               |

Audio is accepted only in the final user message. Supply prior history as text messages. System messages map to Live's developer role; user text stays user content. Images are not accepted by the Live voice frontend.

## Capture duration

Promptfoo streams audio in 20 ms frames at the configured sample rate. Recorded audio is followed by `responseWindowMs` of silence (default: 30 seconds). For text prompts, Promptfoo streams silence immediately, asks Live to answer, and starts the response window when Live acknowledges that instruction. It then sends `session.close` and waits for final usage. The input clip plus response window may total at most five minutes.

Live has no authoritative speech-completed event. The response window is a fixed recording window and may cut off speech. Increase it for long replies or backend work. Backend completion and transcript gaps do not end the capture early. Output audio contains the received samples; transcript timestamps are on the session timeline and do not establish playback timing.

`websocketTimeout` covers the handshake, `session.started`, and a text prompt's acknowledgment (default: 30 seconds); `closeTimeoutMs` controls finalization (default: 15 seconds). These timeouts plus the capture duration must fit within `REQUEST_TIMEOUT_MS` (default: five minutes). Increase it for a full five-minute capture. Cancellation and eval shutdown release active sockets. Live responses are not cached.

## Backend delegation

For managed Responses delegation, set `delegation.type: responses` and `delegation.responses.model`. The backend can use `function` and `web_search` tools. It has its own instructions, token limit, reasoning settings, and service tier. Follow [OpenAI's delegation configuration](https://developers.openai.com/api/docs/guides/live-delegation) for supported settings.

For custom functions, set `functionCallHandler: file://tools.js`. Export an async function `(name, args, signal) => string`, where `args` is the JSON argument string. Promptfoo checks the function name against configured tools, collects completed calls, returns every result, and then continues the backend response. Handlers must enforce permissions for actions they execute.

For your own model or agent harness, use `delegation.type: client` and `delegationHandler: file://backend.js`:

```javascript
export default async function handleDelegation(request, signal) {
  // request: { id, offsetMs, input, transcript }
  // Consult your backend using the startup history and timestamped transcripts.
  // Honor signal to stop work when the eval ends.
  return 'The order shipped today.';
}
```

The delegation event contains an ID, not task text. Your handler receives a snapshot of the conversation collected so far. Return a concise string within Live's 500-token append limit. Promptfoo sends it as commentary using the original delegation ID. Handler errors are reported without sending exception details to the model. Late results are discarded after closing.

Omitting delegation selects client mode. If Live requests backend work without a handler, the eval reports an error. Backend work that is pending when the capture ends, or requested after it ends, also reports an error.

A spoken answer does not show that backend work ran. `metadata.delegations` lists each delegation's `id`, `target`, and `offsetMs`, and `metadata.backendResponses` lists completed Responses calls. Assert on these fields when a test requires delegation:

```yaml
assert:
  - type: javascript
    value: context.providerResponse.metadata.delegations.length > 0
```

## Errors and refusals

Startup failures report the server's error code and message. After startup, Live `error` events are recorded in `metadata.apiErrors` with the code, type, redacted message, parameter, and rejected client event, without ending the capture:

- A rejected opening instruction ends the capture, because Live was never asked to speak.
- Other rejected commands and unattributed errors mark the result as an error and keep the full transcript.
- Errors for work cancelled by `session.close` are recorded but do not change the result.

Safety interventions are graded as refusals rather than errors. A moderation interruption sets `isRefusal` and `guardrails.flagged`. A session closed by the safety filter (`reason: content`) also sets `finishReason: content_filter` and `conversationEnded`, so multi-turn red team strategies stop probing. Sessions that close as `expired` or `connection_lost` remain errors.

## Results and cost

`output` is the assistant transcript, concatenated exactly as received. `audio` contains playable PCM16 WAV at the session's sample rate, including decoded G.711 responses. `metadata.transcript` retains both speakers' fragments and `start_ms`/`end_ms` timestamps, including overlap. The request count includes the Live session and each completed backend response.

`metadata.voiceSeconds` is the latest cumulative usage snapshot. `metadata.finalUsageConfirmed` is true only when `session.closed` supplies valid final usage. A dropped connection preserves partial output and observed usage, and reports an error.

Voice cost uses the published $0.05/minute rate for `gpt-live-1`; `costPerMinute` overrides it. Responses token usage and model cost are accumulated separately from nested backend events. `cost` includes confirmed voice and backend model costs, excluding hosted-tool fees. Client-managed backend costs are unknown, so those sessions expose voice cost in `metadata.voiceCost` and omit total cost.

See the [runnable example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-live) and [OpenAI's Live session guide](https://developers.openai.com/api/docs/guides/live-conversations).
