---
title: Simulated Voice User
description: Test voice-agent prompts with two GPT-Live sessions, simultaneous speech, chronological transcripts, stereo recordings, separate usage, and bounded run times.
---

# Simulated Voice User

`promptfoo:simulated-voice-user` connects two [OpenAI GPT-Live](./openai-live.md) sessions: a target following your eval prompt and a caller following a test persona and goal. Audio flows continuously in both directions, including while either participant speaks. This tests voice-agent prompts and compatible Live endpoints; it does not dial deployed telephone, SIP, WebRTC, or arbitrary chat targets.

Set `OPENAI_API_KEY` to a project key with GPT-Live access. A run creates two paid sessions. For text conversations, use [Simulated User](./simulated-user.md).

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Cafe voice conversations
prompts:
  - |
    Answer calls for a fictional cafe. Saturday closing time is 4 pm.
    Decaf is available until 3 pm on Saturday. Answer briefly, then listen.
    Answer using only these facts; no backend tools are needed.
providers:
  - id: promptfoo:simulated-voice-user
    label: Cafe voice
    config:
      durationMs: 30000
      target:
        model: gpt-live-1
        audio:
          output:
            voice: marin
      caller:
        model: gpt-live-1
        audio:
          output:
            voice: cedar
tests:
  - vars:
      instructions: |
        You are a customer. Ask when the cafe closes on Saturday.
        After hearing the answer, ask how late decaf is available.
        Thank the agent and say goodbye after both answers. Do not invent facts.
    assert:
      - type: llm-rubric
        value: The assistant correctly answered both questions without inventing facts.
```

Assertions grade the chronological conversation transcript. Select an explicit grader if required by your environment. The simulator is excluded from implicit grader selection. The runnable [example](https://github.com/promptfoo/promptfoo/tree/main/examples/simulated-voice-user) uses deterministic assertions and needs no separate grading model.

## Configuration

| Option               | Default            | Behavior                                                                                                       |
| -------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------- |
| `instructions`       | `{{instructions}}` | Caller persona and goal, rendered with test variables.                                                         |
| `targetInstructions` | Eval prompt        | Optional target instructions, rendered with test variables.                                                    |
| `target`, `caller`   | GPT-Live defaults  | Independent participant model, credentials, endpoint, voice, and backend settings.                             |
| `durationMs`         | `60000`            | Capture window, 1,000–300,000 ms.                                                                              |
| `timeoutMs`          | `120000`           | Hard deadline including preparation, connection and final usage; must exceed `durationMs`, maximum 600,000 ms. |
| `maxBufferedAudioMs` | `3000`             | Audio queue limit per speaker, 20–10,000 ms. Overflow is an error.                                             |
| `recordConversation` | `true`             | Include a stereo WAV through the normal audio/blob result path.                                                |
| `targetSpeaksFirst`  | `false`            | Ask the target to greet the caller first; otherwise the caller starts.                                         |

Participants accept [OpenAI Live options](./openai-live.md), including `apiKey`, `apiKeyEnvar`, `apiBaseUrl`, `headers`, `audio.output.voice`, delegation, and callback handlers. `target.model` and `caller.model` default to `gpt-live-1`. Credentials and endpoints remain separate. Environment overrides apply through the normal provider configuration. Prefer `apiKeyEnvar` over putting secrets in YAML.

Both connections use mono PCM16 at 24 kHz, with 20 ms input frames. Other formats are rejected. Top-level instructions and capture duration take precedence over participant `instructions` and `responseWindowMs`. The inherited `REQUEST_TIMEOUT_MS` also bounds each Live session: startup, capture, and finalization must fit within it. Increase both the overall timeout and `REQUEST_TIMEOUT_MS` for long captures.

This provider uses the Live API, not the Realtime API. Legacy Realtime-only fields such as `maxTurns`, `turnDetectionMode`, `audioFormat`, `targetModel`, and `simulatedUserModel` are rejected with migration guidance. Set each model inside `target` or `caller`; bound conversations by duration. Live has no authoritative turn-completed event.

## Scheduled caller interventions

Use `callerInterventions` to reproduce a mid-conversation correction or interruption attempt:

```yaml
callerInterventions:
  - atMs: 6000
    instructions: Interrupt now and ask how late decaf is available on Saturday, then listen.
```

The optional array accepts at most ten entries. `atMs` is an integer offset from the shared capture start, at least zero and less than `durationMs`. Instructions support test variables and must contain 1–2,000 UTF-8 bytes after rendering. Entries execute in offset order, preserving array order for ties. The same scheduler paces audio and dispatches interventions; audio continues in both directions while the caller receives the instruction.

Each request waits for its matching Live instruction acknowledgment before sending commentary. A rejected or unacknowledged request is reported as an error. When the target refuses, pending caller speech requests are intentionally cancelled; `metadata.voice.participants.caller.cancelledSpeechRequests` records their count. Other caller failures still remain errors. `metadata.voice.interventions` records `scheduledAtMs`, actual `sentAtMs`, the rendered instructions, and the protocol `eventId`. These are control-request times, **not guaranteed speech onset**. The target is never forcibly muted or cancelled. Verify interruption behavior with the listener transcript and actual overlapping audio. Allow enough capture time after each intervention for the caller to speak and the target to respond.

## Results and interpretation

`output` and `metadata.messages` contain speaker-labeled text in chronological order from each listener's input transcript. This grades what the peer recognized, not text generated ahead of audio playback. `metadata.voice.gradingTranscriptSource` is `listener_input`. Generated output can be queued or cut off at the capture boundary and is preserved separately for inspection. `metadata.voice.transcript` retains individual timestamped fragments, with `speaker` (`target` or `caller`) and `source`: `output` is what that participant said; `input` is its recognition of the other participant. These distinguish spoken content from what the listener heard. Transcript timestamps are model estimates; they do not establish precise playback timing or interruption success.

`audio` is a stereo WAV on the shared delivery timeline: **left = target, right = caller**. Silence and overlap are preserved. `metadata.voice.audioChannels` records this mapping. Disabling recording does not disable the audio bridge.

`metadata.voice.stopReason` distinguishes the configured capture limit, remote hangup, safety intervention, timeout, and error. Reaching the capture limit is a normal stop, **not a declaration that the caller achieved its goal**. Use assertions to assess success. The fixed window can cut off a response. Connection failures, invalid media, queue overflow, missing listener transcripts or final usage, and hard timeouts return `ProviderResponse.error` with available partial transcripts and audio. Cancellation closes both sessions and propagates the caller's abort reason.

`metadata.voice.participants` separates each side's generated `spoken` transcript (`spokenSource: generated_output`) and listener `heard` transcript, final usage, observed partial usage, backend cost and response evidence. `voiceSeconds` and `voiceCost` are present only when final usage is confirmed. Total `cost` is reported only when both sessions provide known costs; missing usage is not treated as zero. Client-managed backend costs may remain unknown. As in the ordinary Live provider, hosted tool fees are not included.

To test interruptions, instruct the caller to interrupt a long answer and inspect the recording plus the listener's recognized correction and subsequent response. Concurrent audio transport alone does not prove that the target handles interruptions correctly.
