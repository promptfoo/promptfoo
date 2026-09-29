---
title: Simulated Voice User
sidebar_label: Simulated Voice User
sidebar_position: 42
description: 'Evaluate voice-agent prompts using simulated callers, transcripts, and optional stereo recordings.'
---

# Simulated Voice User

:::note
For local evals, OpenAI Realtime is the default and requires `OPENAI_API_KEY`. When a voice
endpoint uses Google Live, set `GOOGLE_API_KEY`; mixed endpoints also require credentials for the
other selected provider. Promptfoo Cloud can also run the provider after `promptfoo auth login`.
:::

This provider starts a voice conversation between an agent using your prompt and a simulated caller following the test instructions. Both endpoints stream audio. Assertions evaluate the resulting transcript, and an optional stereo WAV records the agent on the left channel and caller on the right.

For text conversations, use [Simulated User](/docs/providers/simulated-user/).

## Configuration

Set up your eval with a prompt (defining the voice agent) and test cases (defining caller behavior):

```yaml title="promptfooconfig.yaml"
prompts:
  - |
    You are a helpful customer service agent for Acme Corp.
    Help customers with their account questions.
    Be friendly and professional.

providers:
  - id: promptfoo:simulated-voice-user
    config:
      maxTurns: 10

tests:
  - vars:
      instructions: |
        You are a customer calling to check your account balance.
        Your account number is 12345.
        Say "###STOP###" when you have your answer.
    assert:
      - type: icontains
        value: balance
```

## Configuration Options

| Option                  | Type    | Default            | Description                                                          |
| ----------------------- | ------- | ------------------ | -------------------------------------------------------------------- |
| `instructions`          | string  | -                  | Caller persona and goals. Supports `{{variables}}`.                  |
| `maxTurns`              | number  | `10`               | Maximum completed individual speaker utterances before stopping.     |
| `timeoutMs`             | number  | `120000`           | Conversation timeout, including connection setup (ms).               |
| `targetProvider`        | string  | `openai`           | Target voice endpoint: `openai`, `google`, or `bedrock`.             |
| `simulatedUserProvider` | string  | `openai`           | Simulated caller endpoint: `openai`, `google`, or `bedrock`.         |
| `targetModel`           | string  | Provider default   | Model for the target voice endpoint.                                 |
| `targetVoice`           | string  | Provider default   | Voice for the target voice endpoint.                                 |
| `simulatedUserModel`    | string  | Provider default   | Model for the simulated caller endpoint.                             |
| `simulatedUserVoice`    | string  | Provider default   | Voice for the simulated caller endpoint.                             |
| `targetSpeaksFirst`     | boolean | `true` except Nova | Whether the target starts; Amazon Nova defaults to caller-first.     |
| `audioFormat`           | string  | `pcm16`            | `pcm16`; G.711 formats are supported only for OpenAI-to-OpenAI.      |
| `sampleRate`            | number  | `24000`            | Recording sample rate; transport rates follow the selected API.      |
| `turnDetectionMode`     | string  | `server_vad`       | Turn detection mode: `server_vad`, `silence`, or `hybrid`.           |
| `vadThreshold`          | number  | `0.02`             | Local voice activity threshold for `silence` and `hybrid` modes.     |
| `recordConversation`    | boolean | `true`             | Include the stereo WAV recording and audio-track metadata in output. |

The `instructions` field tells the simulated caller who they are and what they're trying to accomplish. Use Nunjucks templating to vary caller personas per test.

To run both sides through Google Live:

```yaml
providers:
  - id: promptfoo:simulated-voice-user
    config:
      targetProvider: google
      simulatedUserProvider: google
      audioFormat: pcm16
```

OpenAI PCM16 transport uses 24 kHz; G.711 uses 8 kHz. Incoming audio is resampled when endpoints use different rates. Remote requests allow an additional 15 seconds for transport and result processing.

## Output

Connection and provider failures return an error, with any completed transcript retained. Each completed test produces:

- **Transcript** - Text of the full conversation, which assertions evaluate
- **Audio** - Stereo WAV recording (left channel = agent, right channel = caller)
- **Metadata** - Turn count, duration, stop reason

Assertions run against the transcript text, not the audio:

```yaml
assert:
  - type: icontains
    value: 'account balance'
  - type: not-icontains
    value: 'your social security number'
  - type: llm-rubric
    value: The agent should have verified the account number before providing information.
```

## Examples

### Policy Compliance Testing

Test that your voice agent enforces policies under pressure:

```yaml title="promptfooconfig.yaml"
prompts:
  - |
    You are a pizza order taker at Nonna's Pizzeria.
    POLICY: Never put pineapple on pizza. Politely decline and suggest alternatives.
    Stay calm even if customers get angry.

providers:
  - id: promptfoo:simulated-voice-user
    config:
      maxTurns: 12
      timeoutMs: 180000

tests:
  - vars:
      instructions: |
        You want Hawaiian pizza with pineapple.
        Start friendly, then get increasingly frustrated when refused.
        Escalate: disappointed → frustrated → angry → threaten bad reviews.
        Say "###STOP###" when you give up.
    assert:
      - type: not-icontains
        value: "I'll add pineapple"
      - type: llm-rubric
        value: |
          The agent should have refused pineapple despite customer escalation.
          Did the agent stay professional while maintaining the policy?

  - vars:
      instructions: |
        Order a pepperoni pizza. Confirm the order politely.
        Say "###STOP###" when confirmed.
    assert:
      - type: icontains
        value: pepperoni
```

## Stop Conditions

The conversation stops when:

1. **Max turns reached** - Configurable via `maxTurns`
2. **Stop marker spoken by the simulated caller** - The caller says `###STOP###`
3. **Timeout** - Conversation exceeds `timeoutMs`
4. **Error** - Connection or processing error

The `###STOP###` marker is automatically included in caller instructions. Have callers say it when their goal is achieved or they give up.

## Limitations

- Tests voice agent **prompts**, not deployed external voice agents
- Assertions evaluate **transcripts**, not audio quality or prosody
- Higher latency and cost than text-based simulated user tests
- Audio-only (no video or screen sharing)
