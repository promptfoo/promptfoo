---
title: Simulated Voice User
description: Test voice-agent prompts with two GPT-Live sessions, simultaneous speech, chronological transcripts, stereo recordings, separate usage, and bounded run times.
---

# Simulated Voice User

`promptfoo:simulated-voice-user` connects two [OpenAI GPT-Live](./openai-live.md) sessions: a target following your eval prompt and a caller following a test persona and goal. Audio flows continuously in both directions, including while either participant speaks. This tests voice-agent prompts and compatible Live endpoints; it does not dial deployed telephone, SIP, WebRTC, or arbitrary chat targets.

Set `OPENAI_API_KEY` to a project key with GPT-Live access. A run creates two paid sessions. For text conversations, use [Simulated User](./simulated-user.md).

For an end-to-end workflow with task-state checks, portable recordings, listening, transcription, and calibrated audio review, see [Testing GPT-Live voice agents](/docs/guides/testing-gpt-live/).

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
| `targetPlayback`     | Native                      | Optional `{ mode: 'app-barge-in' }` application playback controller with a separate transcription connection.            |

When provided, `target` and `caller` must be objects containing [OpenAI Live options](./openai-live.md), including `apiKey`, `apiKeyEnvar`, `apiBaseUrl`, `headers`, `audio.output.voice`, delegation, and callback handlers. `target.model` and `caller.model` default to `gpt-live-1`. Credentials and endpoints remain separate. Environment overrides apply through the normal provider configuration. Prefer `apiKeyEnvar` over putting secrets in YAML.

Both connections use mono PCM16 at 24 kHz, with 20 ms input frames. Playout starts with a 200 ms reserve and adapts up to 400 ms for observed arrival jitter, subject to the configured queue limit. It rebuilds reserve only between near-silent source frames. Native mode preserves voiced source samples in order; application mode separately records intentional suppression. This adds bounded buffering delay. Larger stalls can still underflow: participant `playout` metrics separate startup waits, silence replenishment, source starvation, and explicit intervention discards. Other formats are rejected. Top-level instructions and capture duration take precedence over participant `instructions` and `responseWindowMs`. The inherited `REQUEST_TIMEOUT_MS` also bounds each Live session: the slower participant's startup, capture rounded to whole frames, and each participant's finalization must fit within it. Invalid budgets are rejected before either connection opens. Increase both the overall timeout and `REQUEST_TIMEOUT_MS` for long captures.

The two conversational participants use the Live API. Optional application perception uses the Realtime transcription endpoint. Legacy Realtime-only fields such as `maxTurns`, `turnDetectionMode`, `audioFormat`, `targetModel`, and `simulatedUserModel` are rejected with migration guidance. Set each model inside `target` or `caller`; bound conversations by duration. Live has no authoritative turn-completed event.

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

During a clip, generated caller output is discarded and the target continues receiving the prepared audio. Native mode preserves target output; the explicitly enabled application controller below may suppress it. Silent context updates tell the caller what the application is speaking on its behalf. Caller generation resumes at an observed 200 ms quiet PCM boundary; absent packets do not count as silence. Recovery is bounded to three seconds after the final clip frame. This quiet boundary is a recovery heuristic, not an authoritative model turn-end event; inspect the recording for residual tails or repetitions.

Caller rejoin measures complete 20 ms source windows at or below −55 dBFS RMS, including residual noise rather than requiring nearly zero samples. Windows span packet boundaries and cannot release the caller before the prepared clip finishes delivery. Each intervention records this `recoveryPolicy`; changing it changes the caller harness in both native and application tests, so use fresh native controls when comparing revisions.

An entry with only `instructions` retains advisory model steering. Its matching instruction acknowledgment precedes commentary, but acknowledgment does **not** guarantee speech onset. Use `text` for a timed test. Rejected or unacknowledged context/speech requests fail the run. Safety closure cancels pending participant requests; target refusal also cancels the caller's pending speech requests.

`metadata.voice.interventions` records the schedule, actual dispatch, context event IDs, and rendered text. Audio entries also record the prepared PCM hash and duration, trimmed leading silence, source bytes delivered, discarded caller bytes, and recovery time. `firstFrameAtMs` and `completedAtMs` locate accepted clip samples on the recording's media timeline; `firstFrameSentAtMs` records actual local dispatch time. These are separate from acoustic speech onset and from whether the target correctly handles the interruption. Allow enough capture time afterward for its answer, and verify the listener transcript and overlapping audio.

## Application playback control

Omit `targetPlayback` or use `{ mode: 'native' }` for the native benchmark. `{ mode: 'app-barge-in' }` starts independent `gpt-live-transcribe` perception on the target's configured origin and credentials, with `transcriptionDelay: 'minimal'` (or `'low'`). That endpoint must support `/realtime?intent=transcription`. Setup or recognition failure fails the run; it never silently falls back to native behavior.

Only accepted caller PCM enters recognition. An English lexical policy detects selected explicit stop commands and interruption-question prefixes, without receiving schedules or expected text. A decision during target playback clears queued output and withholds source audio. The target receives a fixed context update explaining that speech was withheld. Recovery uses actual near-silent source PCM plus caller silence: `sourceQuietMs` and `callerQuietMs` default to 200 (range 40–1,000); `recoveryTimeoutMs` defaults to 5,000 (range 500–10,000). Unknown settings are rejected. Native mode accepts no application settings.

Target-source quiet uses complete 20 ms windows at or below −60 dBFS RMS, beginning with the first source sample after suppression. A `sourceQuietMs` duration rounds up to a complete window. Accepted-caller quiet retains a peak limit of 8 in PCM16 sample units. The result policy records both methods; neither proves a semantic response boundary or that withheld speech was harmless.

The controller cannot truncate model context or identify an authoritative new response boundary. Check false stops, old speech resuming, withheld correct answers, and follow-up behavior. A short pause can be an ambiguous recovery boundary. Bare partial ‘Stop’, ‘Pause’ and ‘Hold on’ stay provisional until completion or a recognized punctuated form; other command prefixes need an observed word boundary, and a terminal stop-period waits until it cannot be extended into an ellipsis. Contraction apostrophes do not count as quotation marks. A result arriving after another caller speech segment starts is conservatively rejected. These checks can delay or miss a valid command and do not guarantee a subsecond cutoff. See [the application comparison workflow](/docs/guides/testing-gpt-live/#compare-explicit-application-barge-in).

`metadata.voice.targetPlayback` records mode, policy, decisions, recovery events, recognition, and source/delivery/discard accounting. Its `clock` is `media` after at least one audio frame is accepted; zero-frame failures and refusals keep the `provider` clock. Recognition delay is a requested setting unless explicitly echoed by the service. Unconfirmed recognition usage keeps aggregate cost unset; its estimate is labeled separately.

When recording is enabled, `metadata.audio` contains a separate mono target-source WAV on the `source_sample_order` clock, while top-level `audio` remains the delivered conversation. The exporter verifies both. Generated source includes unheard speech and must not satisfy heard-answer assertions. Compare application results against separate native runs; treated source cessation is not an untreated native counterfactual.

## Results and interpretation

`output` and `metadata.messages` preserve the observed arrival order of listener input-transcript events on the runner's shared local clock (`receivedAtMs`), including each listener's fragment order. This grades what the peer recognized, not text generated ahead of audio playback. `metadata.voice.gradingTranscriptSource` is `listener_input`, and `gradingTranscriptOrder` is `listener_event_arrival`. Recognition events can arrive late or interleave within a word; their order is not precise acoustic or word alignment. Generated output can be queued or cut off at the capture boundary and is preserved separately for inspection. `metadata.voice.transcript` retains individual fragments with model-estimated `startMs`/`endMs`, local `receivedAtMs`, `speaker` (`target` or `caller`) and `source`: `output` is generated speech; `input` is that participant's recognition of the other participant. Model timestamps can drift between sessions and are not used to order the combined grading transcript. Use the recording to assess actual playback timing and interruption success.

`audio` is a stereo WAV on the shared delivery timeline: **left = target, right = caller**. Silence and overlap are preserved. `metadata.voice.audioChannels` records this mapping. Disabling recording does not disable the audio bridge.

`metadata.voice.stopReason` distinguishes the configured capture limit, remote hangup, safety intervention, timeout, and error. Reaching the capture limit is a normal stop, **not a declaration that the caller achieved its goal**. Use assertions to assess success. The fixed window can cut off a response. Connection failures, invalid media, queue overflow, missing listener transcripts or final usage, and hard timeouts return `ProviderResponse.error` with available partial transcripts and audio. Cancellation closes both sessions and propagates the caller's abort reason.

`metadata.voice.participants` separates each side's generated `spoken` transcript (`spokenSource: generated_output`) and listener `heard` transcript, final usage, observed partial usage, backend cost and response evidence. `voiceSeconds` and `voiceCost` are present only when final usage is confirmed. Total `cost` is reported only when both sessions, every speech-preparation response, and any application recognizer provide confirmed costs; missing usage is not treated as zero. `metadata.voice.interventionPreparation` reports preparation requests, known cost, and whether that cost is complete. The default speech model does not report cost in its binary response, so a run with prepared speech usually has no aggregate cost even when both Live usages are finalized. Client-managed backend costs may remain unknown. As in the ordinary Live provider, hosted tool fees are not included.

To test interruptions, instruct the caller to interrupt a long answer and inspect the recording plus the listener's recognized correction and subsequent response. Concurrent audio transport alone does not prove that the target handles interruptions correctly.
