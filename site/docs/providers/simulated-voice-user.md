---
title: Simulated Voice User
sidebar_label: Simulated Voice User
sidebar_position: 42
description: 'Evaluate OpenAI realtime voice-agent prompts with simulated callers, transcript assertions, token usage, and optional stereo recordings at a chosen sample rate.'
---

# Simulated Voice User

`promptfoo:simulated-voice-user` connects two OpenAI Realtime sessions: an agent using your prompt and a caller following the test instructions. Both endpoints stream audio. Assertions grade the transcript; an optional stereo WAV records the agent on the left channel and the caller on the right.

Set `OPENAI_API_KEY`, or configure `targetApiKey` and `simulatedUserApiKey` separately.

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

| Option                  | Type    | Default          | Description                                                                        |
| ----------------------- | ------- | ---------------- | ---------------------------------------------------------------------------------- |
| `instructions`          | string  | -                | Caller persona and goals. Supports `{{variables}}`.                                |
| `maxTurns`              | number  | `10`             | Maximum completed individual speaker utterances. Must be a positive integer.       |
| `timeoutMs`             | number  | `120000`         | Conversation timeout, including connection setup (ms). Must be a positive integer. |
| `targetProvider`        | string  | `openai`         | Target voice endpoint. Only `openai` is supported.                                 |
| `simulatedUserProvider` | string  | `openai`         | Caller voice endpoint. Only `openai` is supported.                                 |
| `targetModel`           | string  | Provider default | OpenAI Realtime model for the target.                                              |
| `targetVoice`           | string  | `alloy`          | Voice for the target voice endpoint.                                               |
| `simulatedUserModel`    | string  | Provider default | OpenAI Realtime model for the caller.                                              |
| `simulatedUserVoice`    | string  | `echo`           | Voice for the simulated caller endpoint.                                           |
| `targetSpeaksFirst`     | boolean | `true`           | Whether the target speaks first.                                                   |
| `audioFormat`           | string  | `pcm16`          | `pcm16`, `g711_ulaw`, or `g711_alaw`.                                              |
| `sampleRate`            | number  | `24000`          | PCM recording sample rate; G.711 recordings use 8 kHz.                             |
| `turnDetectionMode`     | string  | `server_vad`     | Turn detection mode: `server_vad`, `silence`, or `hybrid`.                         |
| `vadThreshold`          | number  | `0.02`           | Local voice activity threshold for `silence` and `hybrid` modes.                   |
| `recordConversation`    | boolean | `true`           | Include the stereo WAV recording and audio-track metadata in output.               |

The `instructions` field tells the simulated caller who they are and what they're trying to accomplish. Use Nunjucks templating to vary caller personas per test.

OpenAI PCM16 transport uses 24 kHz; G.711 uses 8 kHz. The recording is resampled to `sampleRate` without changing the transport rate. `sampleRate` must be a positive integer no greater than 192000 Hz. Provider `env` overrides apply to both connections; explicit endpoint keys take precedence.

## Output

Connection and provider failures return an error, with any completed transcript retained. Each completed test produces:

- **Transcript** - Text of the full conversation, which assertions evaluate
- **Audio** - Stereo WAV recording (left channel = agent, right channel = caller)
- **Metadata** - Turn count, duration, stop reason
- **Token usage** - Input, output, cached tokens and request counts from both speakers

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
