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

Assertions grade the listener transcript described below. Select an explicit text grader; the simulator is excluded from implicit grader selection. The runnable [example](https://github.com/promptfoo/promptfoo/tree/main/examples/simulated-voice-user) uses separate `grounded_facts` and `completed_goals` rubrics with `openai:gpt-6-luna`, plus deterministic listener-evidence and final-usage checks. A correct answer can still fail factuality if the target adds unsupported menu varieties or prices.

Keep authoritative facts and required goals in evaluator-owned configuration. The example places them in the grader system message and projects listener-recognized speech into ordered, fixed-speaker messages as untrusted data. Recorded turn order determines which question a confirmation answers. Older aggregate-only evidence is explicitly unordered, so context-dependent confirmations cannot satisfy a goal. Caller guesses and generated or injected text that was not heard cannot satisfy a target-answer goal. The calibration suite includes the original invented-menu transcript and question/confirmation ordering controls; inspect its individual reasons and expected labels rather than its aggregate pass rate. These text grades do not establish audio smoothness, exact interruption timing, or ASR accuracy.

## Configuration

| Option               | Default                     | Behavior                                                                                                                 |
| -------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `instructions`       | `{{instructions}}`          | Caller persona and goal, rendered with test variables.                                                                   |
| `targetInstructions` | Eval prompt                 | Optional target instructions, rendered with test variables.                                                              |
| `target`, `caller`   | GPT-Live defaults           | Independent participant model, credentials, endpoint, voice, and backend settings.                                       |
| `durationMs`         | `60000`                     | Capture window, 1,000–300,000 ms.                                                                                        |
| `timeoutMs`          | `120000`                    | Hard deadline including preparation, connection and final usage; must exceed `durationMs`, maximum 600,000 ms.           |
| `maxBufferedAudioMs` | `3000`                      | Audio queue limit per speaker, 20–10,000 ms. Overflow is an error.                                                       |
| `interventionTts`    | Caller connection and voice | Optional speech `model`, `voice`, `instructions`, and `speed` for prepared interventions. Defaults to `gpt-4o-mini-tts`. |
| `recordConversation` | `true`                      | Include a stereo WAV through the normal audio/blob result path.                                                          |
| `targetSpeaksFirst`  | `false`                     | Ask the target to greet the caller first; otherwise the caller starts.                                                   |

When provided, `target` and `caller` must be objects containing [OpenAI Live options](./openai-live.md), including `apiKey`, `apiKeyEnvar`, `apiBaseUrl`, `headers`, `audio.output.voice`, delegation, and callback handlers. `target.model` and `caller.model` default to `gpt-live-1`. Credentials and endpoints remain separate. Environment overrides apply through the normal provider configuration. Prefer `apiKeyEnvar` over putting secrets in YAML.

Both connections use mono PCM16 at 24 kHz, with 20 ms input frames. Playout starts with a 100 ms reserve and adapts up to 400 ms for observed arrival jitter, subject to the configured queue limit. It rebuilds reserve only between near-silent source frames; voiced source samples are preserved in order. This adds bounded buffering delay. Larger stalls can still underflow: participant `playout` metrics separate startup waits, silence replenishment, source starvation, and explicit intervention discards. Other formats are rejected. Top-level instructions and capture duration take precedence over participant `instructions` and `responseWindowMs`. The inherited `REQUEST_TIMEOUT_MS` also bounds each Live session: the slower participant's startup, capture rounded to whole frames, and each participant's finalization must fit within it. Invalid budgets are rejected before either connection opens. Increase both the overall timeout and `REQUEST_TIMEOUT_MS` for long captures.

This provider uses the Live API, not the Realtime API. Legacy Realtime-only fields such as `maxTurns`, `turnDetectionMode`, `audioFormat`, `targetModel`, and `simulatedUserModel` are rejected with migration guidance. Set each model inside `target` or `caller`; bound conversations by duration. Live has no authoritative turn-completed event.

## Scheduled caller interventions

Use `text` for a scheduled caller utterance. The provider renders the complete clip before starting the conversation, then plays it directly on the shared 20 ms media clock. Model generation latency cannot delay this playback:

```yaml
callerInterventions:
  - atMs: 9000
    text: Sorry to interrupt. How late is decaf available on Saturday?
    instructions: After hearing the decaf answer, thank the agent and finish the call.
```

Each entry needs `atMs` and at least one of `text` or `instructions`. Both support test variables and authored templates of up to 2,000 UTF-8 bytes. Each rendered value must contain 1–500 UTF-8 bytes: a conservative local budget for Live's [500-token append limit](https://developers.openai.com/api/docs/guides/live-conversations#add-context-during-the-conversation) without assuming its tokenizer. Oversized rendered values fail before speech preparation or Live connections. At most ten entries are allowed. Clips must be at most 30 seconds, fit within the capture window after rounding to audio frames, and finish before the next intervention. Invalid schedules fail before either Live connection opens; speech already rendered during preparation can still incur cost.

Speech preparation uses the caller's credentials and endpoint. That endpoint must also support OpenAI-compatible `/audio/speech`. `interventionTts` can select a supported speech model, voice (name or `{id: ...}`), style instructions, and speed from 0.25 to 4. The default is `gpt-4o-mini-tts` with the caller voice. Quiet leading blocks are trimmed while retaining 20 ms before detected speech. Check the actual rendering when wording matters: specifying text does not prove that synthesis or recognition reproduced every word.

During a clip, generated caller output is discarded and the target continues receiving the prepared audio while its own output remains untouched. Silent context updates tell the caller what the application is speaking on its behalf. Caller generation resumes at an observed 200 ms quiet PCM boundary; absent packets do not count as silence. Recovery is bounded to three seconds after the final clip frame. This quiet boundary is a recovery heuristic, not an authoritative model turn-end event; inspect the recording for residual tails or repetitions.

An entry with only `instructions` retains advisory model steering. Its matching instruction acknowledgment precedes commentary, but acknowledgment does **not** guarantee speech onset. Use `text` for a timed test. Rejected or unacknowledged context/speech requests fail the run. Safety closure cancels pending participant requests; target refusal also cancels the caller's pending speech requests.

`metadata.voice.interventions` records the schedule, actual dispatch, context event IDs, and rendered text. Audio entries also record the prepared PCM hash and duration, trimmed leading silence, source bytes delivered, discarded caller bytes, and recovery time. `firstFrameAtMs` and `completedAtMs` locate accepted clip samples on the recording's media timeline; `firstFrameSentAtMs` records actual local dispatch time. These are separate from acoustic speech onset and from whether the target correctly handles the interruption. Allow enough capture time afterward for its answer, and verify the listener transcript and overlapping audio.

## Results and interpretation

`output` and `metadata.messages` preserve the observed arrival order of listener input-transcript events on the runner's shared local clock (`receivedAtMs`), including each listener's fragment order. This grades what the peer recognized, not text generated ahead of audio playback. `metadata.voice.gradingTranscriptSource` is `listener_input`, and `gradingTranscriptOrder` is `listener_event_arrival`. Recognition events can arrive late or interleave within a word; their order is not precise acoustic or word alignment. Generated output can be queued or cut off at the capture boundary and is preserved separately for inspection. `metadata.voice.transcript` retains individual fragments with model-estimated `startMs`/`endMs`, local `receivedAtMs`, `speaker` (`target` or `caller`) and `source`: `output` is generated speech; `input` is that participant's recognition of the other participant. Model timestamps can drift between sessions and are not used to order the combined grading transcript. Use the recording to assess actual playback timing and interruption success.

`audio` is a stereo WAV on the shared delivery timeline: **left = target, right = caller**. Silence and overlap are preserved. `metadata.voice.audioChannels` records this mapping. Disabling recording does not disable the audio bridge.

`metadata.voice.stopReason` distinguishes the configured capture limit, remote hangup, safety intervention, timeout, and error. Reaching the capture limit is a normal stop, **not a declaration that the caller achieved its goal**. Use assertions to assess success. The fixed window can cut off a response. Connection failures, invalid media, queue overflow, missing listener transcripts or final usage, and hard timeouts return `ProviderResponse.error` with available partial transcripts and audio. Cancellation closes both sessions and propagates the caller's abort reason.

`metadata.voice.participants` separates each side's generated `spoken` transcript (`spokenSource: generated_output`) and listener `heard` transcript, final usage, observed partial usage, backend cost and response evidence. `voiceSeconds` and `voiceCost` are present only when final usage is confirmed. Total `cost` is reported only when both sessions and every speech-preparation response provide known costs; missing usage is not treated as zero. `metadata.voice.interventionPreparation` reports preparation requests, known cost, and whether that cost is complete. The default speech model does not report cost in its binary response, so a run with prepared speech usually has no aggregate cost even when both Live usages are finalized. Client-managed backend costs may remain unknown. As in the ordinary Live provider, hosted tool fees are not included.

To test interruptions, instruct the caller to interrupt a long answer and inspect the recording plus the listener's recognized correction and subsequent response. Concurrent audio transport alone does not prove that the target handles interruptions correctly.
