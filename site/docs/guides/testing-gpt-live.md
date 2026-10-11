---
title: Testing GPT-Live voice agents
description: Test GPT-Live conversations with repeatable callers, verified tool outcomes, portable recordings, independent transcription, and calibrated audio review.
sidebar_label: Testing GPT-Live
---

# Testing GPT-Live voice agents

A voice test needs to establish what the agent did, what each participant heard, and how the conversation sounded. A correct transcript does not prove smooth audio. A spoken booking confirmation does not prove that a booking happened.

This guide runs the [simulated voice user](/docs/providers/simulated-voice-user/) example against two real GPT-Live sessions. It includes factual questions, a scheduled interruption, a backchannel, and a reservation backed by a local application fixture. It also exports recordings for playback, independent transcription, signal inspection, and direct audio-model review.

The target is a configured GPT-Live assistant, not a telephone number or WebRTC deployment. The reservation fixture never contacts a real booking service. See the [GPT-Live provider](/docs/providers/openai-live/) for recorded-input tests and backend configuration.

## Define independent outcomes

Keep these questions separate when interpreting a run:

| Question                                   | Evidence                                                                 | Failure example                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Was the test valid?                        | Connections, termination, frame delivery, recording, and caller behavior | The scheduled correction was never delivered, or the caller omitted it.               |
| Was the task completed correctly?          | Listener evidence plus executed operations and saved application state   | The agent says August 6 but saves August 7.                                           |
| Did the conversation behave appropriately? | Delivered audio, intervention timing, and subsequent behavior            | The agent abandons its answer after “mm-hmm,” or keeps speaking through a correction. |
| Is the audio usable?                       | Actual playback, signal measurements, and independent audio review       | Missing syllables, clipping, repeated fragments, or a truncated ending.               |

OpenAI's [GPT-Live evaluation guide](https://developers.openai.com/cookbook/examples/audio/voice_agent_evaluation) separates controlled speech, recorded inputs, and independent simulated callers, and follows tasks through backend execution to application state. [LiveKit simulations](https://docs.livekit.io/testing/simulations/) likewise distinguish caller-heard timing from production timing. Use controlled clips to isolate a behavior, then adaptive callers to explore complete conversations. These are complementary tests.

## Run the example from source

Use a checkout containing this example. While the feature is unreleased, use the branch in [the implementation PR](https://github.com/promptfoo/promptfoo/pull/6811); an older `promptfoo@latest` installation will not contain it. Run the following commands from the repository root, using its Node and npm versions:

```bash
nvm use
npm ci
npm run build
```

The project key needs access to `gpt-live-1` and the configured backend/grader models. Keep it in an existing private environment file. The commands below use Node's `--env-file`; do not put the key in a configuration or exported artifact.

```bash
VOICE_ENV_FILE=/absolute/path/to/openai.env
VOICE_RUN_DIR="$(mktemp -d)"
export PROMPTFOO_CONFIG_DIR="$VOICE_RUN_DIR/state"

node --env-file="$VOICE_ENV_FILE" dist/src/main.js eval \
  -c examples/simulated-voice-user/promptfooconfig.yaml \
  --repeat 2 --max-concurrency 1 --no-cache \
  -o "$VOICE_RUN_DIR/results.json"
```

Each repetition opens two paid voice sessions and uses the configured text graders. Prepared interventions add a speech-synthesis request. Reservation tests also use a delegated backend. Audio review and transcription below are additional paid requests.

Two repetitions make the walkthrough small; they do not establish a reliable success rate. For comparisons, freeze the scenarios, voices, prompts, model identifiers, deadlines, and criteria, run more repetitions, and retain every outcome. A seed cannot make a hosted voice model deterministic.

Inspect the individual results even when the CLI exits successfully. `grounded_facts` checks unsupported claims separately from `completed_goals`; finding an expected number is not enough. The transcript grader uses recognized listener speech and preserves observed event order. Generated-but-unheard speech does not satisfy an answer.

## Exercise interruption and backchannel behavior

Repeat the eval command with these configurations, using a fresh run directory for each batch:

| Configuration                              | Expected behavior                                                      | Additional evidence to inspect                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `promptfooconfig.interruption.yaml`        | Stop the menu and answer the decaf question.                           | Target speech just before the cue, the caller clip, target cessation, and the answer afterward.      |
| `promptfooconfig.active-interruption.yaml` | Stop a supplied continuous announcement and answer the decaf question. | Speech near caller onset, whether the announcement was unfinished, and whether it resumes afterward. |
| `promptfooconfig.backchannel.yaml`         | Continue the menu after “mm-hmm, go on.”                               | The acknowledgment was heard; the target retains its place and reaches the final item.               |

The menu and backchannel cases use prepared audio at nine seconds. The continuous-announcement case first has the caller request the announcement, then injects its question at twelve seconds. For example:

```bash
VOICE_RUN_DIR="$(mktemp -d)"
export PROMPTFOO_CONFIG_DIR="$VOICE_RUN_DIR/state"
node --env-file="$VOICE_ENV_FILE" dist/src/main.js eval \
  -c examples/simulated-voice-user/promptfooconfig.active-interruption.yaml \
  --repeat 2 --max-concurrency 1 --no-cache \
  -o "$VOICE_RUN_DIR/results.json"
```

The delivery assertion checks the whole clip, media-frame timing, and a configured 50 ms local-dispatch benchmark. That is a harness criterion, not a target-yield guarantee. Speech synthesis can omit or change the supplied text. Verify the spoken stimulus independently; a matching PCM hash proves delivery of prepared samples, not verbatim reading of the script.

A cue delivered during silence has not exercised interruption handling. Check speech immediately before the cue and report unexercised cases separately. Conversely, a target that finishes exactly at the cue can yield with zero overlap: do not require positive overlap merely to manufacture an interruption. The [reference metric contract](https://github.com/openai/openai-cookbook/blob/main/examples/audio/duplex_voice_agent_evaluation/docs/metrics-contract.md) explains eligibility and censored requests.

The exported measurements use declared energy thresholds and window sizes. They describe local delivered audio, not remote speaker playback. Do not label every pause a dropout, every overlap a failure, or an ASR callback timestamp an exact word boundary. Inspect whether the agent handles the new request after yielding; stopping quickly alone is insufficient.

The continuous-announcement example uses a declared eligibility screen: at least 300 ms of active target audio in the second before actual caller onset, including at least 20 ms in the preceding 100 ms. Activity uses 20 ms RMS frames at −40 dBFS. The exporter reports those measurements and the first subsequent 200 ms quiet window. Confirm that the announcement was unfinished too; neither an energy threshold nor a quiet window establishes semantic yielding by itself.

Measure interruption delay before reducing the audio buffer. A received speech chunk can spend time waiting for playback, but the model may also continue speaking before that chunk arrives. With source packets available, match the last delivered speech samples to their received chunk and report those intervals separately. Packet arrival still includes network and server delay; it is not a model-compute measurement. Include a source-stall case with a quiet frame followed by a short queued speech tail: already-received speech must eventually drain, and subsequent starvation must be reported. A zero-underflow counter alone cannot detect speech held indefinitely in a queue. The simulator bounds added replenishment padding while non-quiet audio is queued by its current reserve (normally 200–400 ms); quiet-only replenishment remains available.

The [GPT-Live prompting structure](https://developers.openai.com/api/docs/guides/live-prompting) separates interruption and backchannel policies. Test those policies rather than assuming stronger wording makes yielding faster: in the controlled experiments below, neither an immediate-yield policy nor a listen-first policy improved the measured delay, so the examples retain their original prompts. The simulator does not silently rewrite an evaluated target's policy or mute its output when the cue plays. Compare prompts with the same stimulus and inspect whether the obsolete answer actually ends, then test backchannels and unfamiliar interruption wording too. With `callerInterventions.text` and `--no-cache`, each run synthesizes a fresh clip: retain its hash and duration, and do not describe matching scripts as identical audio.

Inspect `targetActivityAfterFirst200MsQuiet` too. It reports any above-threshold target activity after the first quiet window and before the prepared caller clip ends, including the last active sample window. A pause followed by more sound is not final cessation. That later sound might be speech, a listening sound, or breathing; transcribe and review the recording before assigning semantic meaning.

## Compare explicit application barge-in

Native yielding remains the default. `promptfooconfig.app-barge-in.yaml` adds an explicit target application controller and a separate `gpt-live-transcribe` connection. Run it using the same eval/export commands above. To compare fairly, keep the prompt, caller recording, voices, capture window, and assertions fixed, changing only `targetPlayback.mode` between `native` and `app-barge-in`.

```yaml
targetPlayback:
  mode: app-barge-in
  transcriptionDelay: minimal
```

The recognizer receives only caller PCM already accepted by the target. It has no access to intervention schedules, supplied text, or expected answers. A deliberately narrow English lexical policy recognizes explicit commands and selected interruption-question prefixes. Ambiguous phrases and acknowledgments abstain; this is not semantic VAD or multilingual intent detection. OpenAI's [transcription guide](https://developers.openai.com/api/docs/guides/realtime-transcription) describes the latency/accuracy setting, but it does not guarantee a delay. Retain `requestedDelay`, `delayAcknowledged`, and observed timing separately: the service may omit the delay from its configuration acknowledgment.

On a recognized interruption during target playback, the controller clears queued target audio, withholds subsequent output, and tells the target that generated speech was not heard. Recovery requires actual source PCM silence and caller silence; a packet stall cannot satisfy it. This follows the application-owned [playback-control guidance](https://developers.openai.com/api/docs/guides/voice-server-controls). GPT-Live does not provide output turn IDs or a context-truncation acknowledgment, so silence-based recovery remains a heuristic. Resumed old speech, lost answers, false stops, and failure to recover must remain failures.

Test recognition as a stream, not just as complete sentences. A fragment ending in “Please pause” can continue as “Please pause playback of the video”; “wait a second” can continue as “wait a secondary concern.” Even whitespace after “Hold on” can precede “to my reservation,” so that prefix stays provisional. The detector waits for an observed boundary or completion where needed, distinguishes contraction apostrophes from quotation marks, and defers a terminal stop-period that could become an ellipsis. Replay different chunk splits and negative continuations, then measure any added delay in fresh live runs.

The recorded recovery policies matter: target-source quiet uses 20 ms RMS windows at −60 dBFS, while rejoining the simulated caller after a prepared clip uses −55 dBFS. These development-derived floors tolerate the faint residual noise found in the recordings. The caller rejoin policy applies in native tests too; compare revisions using fresh native controls. Quiet speech and pauses inside an unfinished response remain limitations of an energy-based boundary.

The exporter retains the delivered stereo/mono tracks and an additional target-source WAV. Source offsets follow concatenated received samples, not the delivered recording clock; its player intentionally does not synchronize with the conversation. Source speech is never evidence that the caller heard it. A failure or refusal before any accepted media frame keeps the provider clock: export retains available startup source audio while explicitly reporting the missing heard recording. Source-only tests are `source-transcription-tests.json` and `source-audio-review-tests.json`; pass them to the same transcription and audio-review configurations in separate runs. `recordConversation: false` disables both recordings.

Report native yielding, application detection delay, heard-stop delay, useful-answer latency, false stops, and recovery separately. Freshness checks use actual local frame-acceptance time; exported suppression windows use explicit WAV-frame boundaries (`recordingAtMs`). Older captures label their elapsed-time fallback, which can misalign during dispatch lag. The legacy `detectionDelayMs` subtracts the caller recording onset from elapsed decision time; it is not an acceptance-to-detection latency. The application health assertion checks recognition completion, recovery, and byte accounting. It does not prove a latency target, intelligibility, or task success. Unconfirmed recognition usage is reported as billing uncertainty, not silently counted as zero. This mode adds a paid transcription stream on the target's configured origin and credentials; gateways must support the Realtime transcription endpoint as well as Live.

## Verify an actual operation

The reservation case uses a fixed spoken correction from August 7 to August 6, followed by a backend tool with a two-second delay. The fixture accepts valid wrong dates too: the evaluator, rather than the application fixture, must catch a wrong booking.

Run each repetition in a separate process with a fresh, empty state directory and unique identifier. Do not use `--repeat` with a shared reservation ledger:

```bash
VOICE_RUN_DIR="$(mktemp -d)"
export PROMPTFOO_CONFIG_DIR="$VOICE_RUN_DIR/promptfoo-state"
export VOICE_EVAL_STATE_DIR="$VOICE_RUN_DIR/reservation-state"
export VOICE_EVAL_RUN_ID="$(node -p 'crypto.randomUUID()')"
export VOICE_EVAL_TOOL_MODE=available
mkdir "$VOICE_EVAL_STATE_DIR"

node --env-file="$VOICE_ENV_FILE" dist/src/main.js eval \
  -c examples/simulated-voice-user/promptfooconfig.reservation.yaml \
  --max-concurrency 1 --no-cache \
  -o "$VOICE_RUN_DIR/results.json"
```

`reservation_state` requires one durable successful operation for Maya, August 6, 2027, at 19:00 for two people. It also requires recognition of the spoken correction and the actual tool-returned confirmation code. The code is absent from caller and target prompts. Missing execution, a wrong date, duplicate operations, a fabricated code, or a caller that never voices the correction cannot pass.

Inspect `reservation-ledger.jsonl` alongside the audio. Keep that ledger, the original run identifier, and `VOICE_EVAL_TOOL_MODE` when regrading; an exported conversation alone cannot reconstruct application state. This fixture establishes state correctness and causal grounding of the returned code. It does not expose a shared tool/audio clock, so it cannot certify millisecond timing of confirmation after commit. Review apparent premature success claims separately.

Also run the same block with a fresh directory and identifier, changing `VOICE_EVAL_TOOL_MODE` to `unavailable`. This deliberately makes the tool fail after its delay. The oracle then requires one correctly specified failed attempt and no saved reservation or disclosed confirmation code; the independent transcript grade requires an honest explanation that no booking was created. The selected mode is not sent to the target or caller. This tests failure handling without inducing a real service outage.

## Export a portable recording bundle

Ordinary JSON results contain blob references. Export the evaluation with media while using the same `PROMPTFOO_CONFIG_DIR`:

```bash
node dist/src/main.js export eval latest --include-media \
  -o "$VOICE_RUN_DIR/portable.json"

node examples/simulated-voice-user/export-evidence.js \
  "$VOICE_RUN_DIR/portable.json" --out "$VOICE_RUN_DIR/review"
```

`latest` is safe here because the state directory is private to this batch. Use the printed evaluation ID instead if another eval has since run in that directory. Export before running the separate audio-review eval below.

Open `review/index.html` in a browser. The bundle includes the original stereo WAV, target and caller tracks, source hashes, transcript fragments, grading results, signal measurements, and a manual-review template. The target is on the left and caller on the right. Playback and seeking work locally without a server.

The helper verifies recording hashes and format. Missing or corrupt media produces a partial manifest and nonzero exit; it must not become an audio-quality pass. `manual-review.json` starts as **not reviewed**. Browser playback succeeding does not mean somebody listened.

When present, local playout counters are bound to each exported WAV's hash and speaker. The deterministic audio grader can use that evidence; it is not sent to the audio model. A positive underflow counter identifies a relay failure even when its acoustic boundaries are hard to distinguish from a pause. Zero underflow only means that this counter recorded none.

For the continuous-announcement case, require a mechanically eligible opportunity before interpreting the interruption result:

```bash
node --input-type=module - "$VOICE_RUN_DIR/review/manifest.json" <<'JS'
import { readFileSync } from 'node:fs';
const manifest = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const rows = manifest.rows ?? [];
const eligible = manifest.errors === 0 && rows.length > 0 && rows.every(row =>
  row.metrics?.interventions?.length > 0 && row.metrics.interventions.every(cue =>
    cue.activeSpeechOpportunity === 'eligible-by-pcm'));
console.log(eligible
  ? 'Mechanically eligible; semantic and audio review still required.'
  : 'Inconclusive interruption test: inspect the unexercised or invalid rows.');
process.exitCode = eligible ? 0 : 1;
JS
```

An eval can answer the question correctly and still fail this opportunity screen. Retain that result as unexercised instead of including it in a yielding success rate.

Listen to the complete conversation at normal speed, then isolate each speaker. Revisit the opening, each cue, long quiet intervals, repeated or unclear speech, and the recording ending. Record the interval, speaker, observation, severity, and uncertainty. Signal-analysis zero islands are candidates to inspect, not a perceptual diagnosis. When source packets are available, compare source PCM with delivered PCM to distinguish generation problems from relay problems.

## Transcribe and review the actual audio

First run the signal grader on the exported WAVs. This command makes no model requests:

```bash
node examples/simulated-voice-user/grade-audio-signal.js \
  --tests "$VOICE_RUN_DIR/review/audio-review-tests.json" \
  --out "$VOICE_RUN_DIR/signal-review.json"
```

It reports exact silence, clipping, repeated PCM, suspicious internal zero gaps, and any bound transport-underflow evidence. Suspicious signal findings require review; they do not establish a network cause. Ordinary pauses and active capture endings can be ambiguous. Keep the report even when the command exits nonzero.

Run an independent transcription of the two delivered speaker tracks, without supplying the expected words:

```bash
node --env-file="$VOICE_ENV_FILE" dist/src/main.js eval \
  -c examples/simulated-voice-user/promptfooconfig.transcription.yaml \
  --tests "$VOICE_RUN_DIR/review/transcription-tests.json" \
  --max-concurrency 1 --no-cache -o "$VOICE_RUN_DIR/transcriptions.json"
```

Compare those transcripts with listener recognition and the source script afterward. Preserve disagreement. ASR can omit a brief goodbye, repair an interrupted phrase, or hallucinate on silence. A nonempty transcription is not proof of clear audio, and word error rate requires a trustworthy reference transcript.

The direct audio reviewer receives the WAV bytes, not the transcript. Exported tests identify the stereo conversation or isolated speaker track so the reviewer knows that the other participant is intentionally absent from a mono track:

```bash
node --env-file="$VOICE_ENV_FILE" dist/src/main.js eval \
  -c examples/simulated-voice-user/promptfooconfig.audio-review.yaml \
  --tests "$VOICE_RUN_DIR/review/audio-review-tests.json" \
  --max-concurrency 1 --no-cache -o "$VOICE_RUN_DIR/audio-review.json"
```

This uses `gpt-audio-1.5` through the existing Chat Completions provider. It returns `no_issue_flagged`, `review_required`, or `unratable`, with a transcript and observations. Invalid output fails validation. **No issue flagged is an advisory finding, not a quality certificate.** Exact silence must remain unratable even if the model invents a transcript. For exported stereo conversations with one participant per channel, a timestamped overlap claim is also rejected when either channel is exactly zero throughout that interval. This refutes that localization; nonzero channels do not prove simultaneous speech or good quality.

The eval also runs `audio_signal_integrity` independently of `audio_no_issue_flagged`. Preserve both results: a model error does not become a passing review because the signal check succeeded, and a model's clean verdict does not erase a measured defect.

Direct audio-model review and human listening are different evidence. In development, the audio model recovered a short goodbye missed by ASR, but missed a packet-proven 200 ms gap. Blinded controls also exposed inconsistent judgments on identical audio and invented speech on digital silence. Retain those failures; do not replace missing acoustic evidence with a confident model explanation.

## Calibrate before trusting a score

Use a recording bundle from the interruption or reservation case. Its verified `case-001-intervention-001.wav` contains the delivered prepared utterance; the caller track also contains natural pauses. Generate blinded edits without modifying either source:

```bash
node examples/simulated-voice-user/calibrate-audio.js \
  --source "$VOICE_RUN_DIR/review/case-001-intervention-001.wav" \
  --pause-source "$VOICE_RUN_DIR/review/case-001-caller.wav" \
  --out "$VOICE_RUN_DIR/calibration"

node --env-file="$VOICE_ENV_FILE" dist/src/main.js eval \
  -c examples/simulated-voice-user/promptfooconfig.audio-review.yaml \
  --tests "$VOICE_RUN_DIR/calibration/audio-review-tests.json" \
  --max-concurrency 1 --no-cache -o "$VOICE_RUN_DIR/calibration-results.json"

node examples/simulated-voice-user/score-audio-calibration.js \
  --labels "$VOICE_RUN_DIR/calibration/frozen-labels.json" \
  --results "$VOICE_RUN_DIR/calibration-results.json" \
  --out "$VOICE_RUN_DIR/calibration-score.json"
```

The generator performs no API calls. It saves the originals, opaque WAV inputs, exact edits, hashes, and a separate frozen answer key. Controls include unchanged copies, silent gaps, repeated audio, severe clipping, truncation, and silence. The expected edits are engineering controls, not human-rated acoustic ground truth. Do not send the answer key to the model.

Calibration inputs also retain an independently hashed clean reference for the deterministic grader. A matching reference can prove a local erasure or missing suffix that cannot reliably be inferred from sound alone. It must be the intended original recording, not another synthesis of the same words; hashes bind the bytes but do not establish who supplied them. The audio-model prompt receives neither the reference nor expected labels. The scorer reports reference-free signal, reference-aware signal, model-only, and combined outcomes separately. Freeze the policy before testing new speakers, source clips, edit positions, and defect durations; retain clean gain-change and natural-pause controls to measure false alarms.

Some calibration rows should fail the ordinary quality assertion, so that eval can exit nonzero while still producing its results. Run the scorer afterward; it also exits nonzero when calibration fails. Distinguish expected defect flags from provider errors, malformed judgments, missing results, and abstentions. Report every control and the denominator, including missed defects and clean-control false alarms. Keep the original outputs if you revise a rubric, and use new held-out cases for the revision. Recalibrate after changing the model or audio preprocessing.

The text-grader controls in `promptfooconfig.calibration.yaml`, `promptfooconfig.confirmation-calibration.yaml`, and `promptfooconfig.order-calibration.yaml` test invented facts and ambiguous confirmations independently of audio. Include a correct code followed by a numeric sentence, such as “Confirmation code one two three four five six. Two people at seven PM.” The reservation assertion stops at the sentence boundary while still rejecting overlong or conflicting codes; truncating every candidate to the expected length would hide fabricated codes. A reliable test suite needs both semantic and acoustic controls.

Check the simulated caller separately too. A correct target answer can coexist with a caller that starts speaking as the service representative. The optional caller review uses saved listener evidence and makes no new voice calls:

```bash
node examples/simulated-voice-user/prepare-caller-review.js \
  "$VOICE_RUN_DIR/portable.json" --instructions-var instructions \
  --out "$VOICE_RUN_DIR/caller-review-tests.json"

node --env-file="$VOICE_ENV_FILE" dist/src/main.js eval \
  -c examples/simulated-voice-user/promptfooconfig.caller-review.yaml \
  --tests "$VOICE_RUN_DIR/caller-review-tests.json" \
  --max-concurrency 1 --no-cache -o "$VOICE_RUN_DIR/caller-review.json"
```

Here `instructions` must contain the actual caller instructions used, as it does in these examples. If the provider overrides or templates them elsewhere, supply the rendered instructions with `--instructions-file FILE` instead. Preparation refuses missing instructions and does not infer a persona. The original results remain unchanged.

The preparer also identifies scripts for completely delivered harness clips. Matching speech must not be blamed on the autonomous caller for disobeying an instruction to stay quiet. A script is permission for that intervention, not proof that its exact words were audible. Capture termination is supplied separately so a missing farewell at a time limit is not automatically treated as abandonment.

This adds one text-model request per row and reports `valid`, `invalid`, or `inconclusive`. Findings must quote recognized caller speech; generated answers and target-source audio cannot establish caller success. Quotes, confirmations, polite thanks, and overlapping recognition need context. Both invalid and inconclusive reviews fail the advisory validity assertion. Reconcile disagreements against delivered audio rather than interpreting a text verdict as acoustic truth. Run the same review config with `--tests examples/simulated-voice-user/caller-review-calibration.json` to check its synthetic controls; compare returned statuses with `metadata.expectedCallerReviewStatus`. Defect and inconclusive controls intentionally fail the ordinary validity assertion.

## What the live checks found

An October 11 check ran **five fresh captures after correcting streamed command boundaries**. All five met the pre-cue target-activity screen. All **17,500 delivered frames** matched the WAV channels; **435 Live fragments and 84 recognition events** were inspected. No provider errors, retries or bridge underflows occurred. Original grades were **32/35 assertions and 3/5 evals passing**; these are development cases, not a reliability benchmark.

| Final detector case             | Original assertions | Observed behavior                                                                                                                                                                   |
| ------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Matched Wait: native / app      | 7/7 each            | Native first 200 ms quiet: **1,380 ms**. App heard-stop bound: **900 ms**, then recovery. **34.8% lower** in this one pair, still above 750 ms.                                     |
| Stop with a spoken continuation | 5/7                 | No app stop. The final Stop transcript arrived after another caller segment began and was rejected as stale; old menu speech continued before the target invited the next question. |
| Pause-playback negative control | 7/7                 | Actual recognition delivered “Please pause” before “playback”; **zero app stops and zero discarded bytes**.                                                                         |
| Bare Stop                       | 6/7                 | Heard-stop bound **1,040 ms**, then recovery. No acknowledgment followed; the source trace did not show a generated reply being lost.                                               |

Two of three intended app interruptions were detected and recovered; **0/3 met 750 ms**. The continuation case did not exercise the exact curly-apostrophe fix live because the independent recognizer misheard the contraction. Deterministic streamed tests cover that spelling. The negative control also contains a caller-opening restart candidate that requires audio inspection despite its passing task grade.

Ten independent transcriptions and 14 direct WAV reviews then inspected these recordings. The audio model returned three advisory no-issue judgments and 11 review-required judgments; all 14 separate signal checks were unflagged. Audio reviews corroborated the Wait answers and the continuation case's eventual follow-up question, which ASR omitted. ASR also expanded an interrupted menu fragment into additional words and omitted the bare Stop cue. An earlier blind transcription of the hash-identical prepared clip confirms “Stop”; its PCM matches the new delivered caller segment exactly. Some audio judgments treated intentional interruption or a source-level pause as a possible dropout, so their labels are not transport evidence. The negative control's opening restart remained uncorroborated by independent ASR and stereo review; all 122 active initial caller frames matched source in order without transport duplication. Including earlier stages, this round contains **233 recording-review requests: 102 ASR and 131 direct audio**, with no review retries.

The boundary correction trades early guesses for observed delimiters or completion. Replay of 322 older recognition events moved Wait decisions about 9–12 ms later and some bare Stop-period decisions 297–403 ms later; one would cross the latest-caller-turn fence. That replay is not a new heard-latency measurement. The fresh cases above retain a missed Stop rather than relaxing the fence and risking cancellation of a new answer. Subsequent Unicode-apostrophe and hold-on-continuation corrections left detector outputs unchanged for all 84 captured recognition events in replay; their additional inputs were covered separately by focused tests.

A later clock/refusal regression fix separated actual frame acceptance from recorded sample positions, prevented delayed transcription initialization from shifting decisions, and kept valid target refusals gradable during suppression. A fresh 35-second app call on that code passed **7/7 assertions**, with all **3,500 delivered frames, 100 Live fragments and 40 recognition events** checked. Explicit WAV boundaries place suppression at **12.920–16.500 s**, with no active target frames inside that interval, a **900 ms heard-stop bound**, and no bridge underflow. This single confirmation is not another native/app pair and still misses 750 ms. Two additional transcriptions and three WAV reviews corroborated the full 3 pm answer and goodbye. Caller ASR also confirmed an unscripted “Decaf is” echo over the answer that the stereo reviewer omitted; passing task assertions did not establish caller adherence. An isolated-track audio review flagged a dropout at 11–12 s, but every delivered sample in that interval matches source PCM; its localization does not establish transport loss. Source comparison separately accounts for the intentional later cutoff. Recording-review totals are now **238 requests: 104 ASR and 134 direct audio**, without retries.

The final shared-playout correction bounds padding that could otherwise hold a short queued speech tail indefinitely during a source stall. Eight regression cases fail on the old implementation; the corrected buffer drains the speech and lets the existing health grader report subsequent starvation. Replay of both participant streams in 18 saved conversations preserved all **69,500 directional delivered frames**, including the previously reported 20 ms underflow. This is fixed-input replay, not another live benchmark.

A fresh native/app pair on that code passed **13/14 assertions**: native 7/7, app 6/7. Both interruption opportunities were eligible. Native first-200-ms-quiet delay was **1,180 ms** and app heard-stop bound **940 ms**, a **20.3% reduction** in these scoped measurements; this pair misses both the 750 ms and 25% improvement benchmarks. The app grader retained a **20 ms underflow at recording 11.060–11.080 s**, before the cue. Old and corrected buffers reproduce the same event on those captured inputs. Exact PCM shows the following speech delayed one frame without deleted or replaced source samples; that does not establish inaudibility. Four independent transcriptions and five WAV reviews corroborated complete answers and farewells, without the earlier caller echo. Both heard-app audio reviews called the sound clear, while transport-backed signal grading correctly failed them for the gap; the source review retained uncertainty about an interrupted menu word. The total is now **247 recording-review requests: 108 ASR and 139 direct audio**, with no review retries. The failed run remains a failure, and universally gap-free audio is not established.

Earlier October 11 application-control checks used the preceding detector policy: the original 16 attempts, a two-attempt recovery experiment (including its provider failure), and a 12-attempt cohort after fixing recovery. Their results below remain unchanged. That recovery cohort used the same prepared caller PCM and included fresh native controls because the prepared-caller rejoin policy changed. These were development cases informed by observed failures, not a held-out benchmark.

| Earlier recovery-cohort measurement         | Observed result                                                                                                                                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two matched “Wait a second” pairs           | Native first 200 ms quiet: **1,400 / 1,320 ms**. App heard-stop bounds: **1,000 / 940 ms**. Medians: 1,360 / 970 ms, a **28.7% reduction** in these scoped measurements.    |
| Six intended app interruptions              | Five triggered and recovered; one bare “Stop” was missed. **0/6 met the predeclared 750 ms bound.** Other detected bounds were 820 / 760 / 760 ms.                          |
| Three acknowledgment/ordinary-turn controls | No false application stops. A long acknowledgment still caused the target to restart its menu; a short one preceded a 1.58 s pause.                                         |
| Original assertions                         | **77/84 passed; 6/12 evals passed.** Model-grade disputes and failures remain in the results. These assertions do not include the separate 750 ms acceptance criterion.     |
| Transport and evidence                      | All 48,500 delivered frames matched exported channels; all 1,435 Live fragments and 258 recognition events were inspected. One native trial retained a **20 ms underflow**. |

The recovery fix addressed a concrete source/heard discrepancy: faint residual noise in a pause previously kept the controller muted through a generated acknowledgment. With RMS-based recovery, one final Stop trial generated and delivered “Sure, pausing there. What do you need to know?” after suppression. Another generated no acknowledgment at all and still failed its task criterion. Separating source and delivered recordings distinguishes those failures.

The missed Stop exposes the narrow policy's limit. Its final transcript arrived after a new caller speech segment began, so the conservative stale-result fences rejected it. Accepting any recent old command could instead cut off a fresh answer; GPT-Live supplies no output turn identifier to disambiguate that case. The final transcript also arrived about 967 ms after onset, so simply accepting it would not establish a sub-750 ms result.

The two Wait pairs are not two wholly clean successes: one native caller later asserted an incorrect cutoff time, and that run also contained the underflow before the cue. The 20 ms insertion occurred in a low-energy region; exact replay showed that it did not replace source audio at that gap or establish audible word loss. Some source audio remained queued at capture end, so this does not prove every generated sample was heard. The original transport assertion still fails. Likewise, a text judge incorrectly treated a pre-stop menu tail as a restarted announcement in an app trial. Retain raw grades and reconcile temporal claims against the recordings; neither the improved median nor a passing factual grade proves a clean conversation.

Independent review of the final 12 recordings, both partial-recovery recordings, and the first Cloud recording used **41 ASR requests and 56 direct audio reviews**, without retries. The audio model returned 25 advisory no-issue judgments, 30 review-required judgments, and one malformed response that remained unreviewed. ASR omitted the recovered acknowledgment; stereo and target-only audio review recovered it, and its active PCM frames matched the delivered recording exactly. The 1.58 s pause also matched source PCM, establishing a generated pause rather than added transport silence. Source audio review caught a repeated menu that the heard-track model review and ASR missed; exact source-to-delivery matching showed the repetition was delivered. The audio model did not identify the packet-proven 20 ms underflow.

A subsequent Cloud UI run on that preceding detector policy completed and saved both recordings automatically, stopped at an application heard-stop bound of **740 ms**, and recorded no underflow. Recovery occurred at media time 16.233 s, about 4.213 s after caller onset; stopping and recovery are separate measurements. This was one additional run with fresh synthesized caller audio, not another matched pair. Six of seven assertions passed; the factual grader flagged listener text “the mayor” as an invented menu item. Review of the heard and source tracks instead supported an interrupted “Amer…” prefix, with the discarded source continuing “Americano.” Exact PCM matching showed an intentional interruption cutoff. The evidence therefore supports recognition disagreement rather than a demonstrated invented fact; the original failed grade remains. The complete 3 pm answer and farewell were heard afterward. At that stage, the recording review total was **209 requests: 92 ASR and 117 direct audio reviews**; those outcomes remain unchanged.

Revalidating 57 earlier audio judgments with the stereo-channel guard rejected two falsely localized overlap claims without making another model request. Both retained their raw judgments and remained unreviewed; rejecting an invented defect did not turn either recording into a quality pass.

The optional caller review caught an actual caller speaking as the cafe representative, but also invented a requirement to ask another question in a different recording. Its revised synthetic calibration matched 14/17 raw model statuses; an additional deterministic guard refuses a confident pass when conversation order is unavailable. Exact recognized quotations help ground findings but do not prove their interpretation. Treat this review as advisory and retain disagreements.

Development checks on October 10, 2026 compared two stronger target policies against the original announcement prompt. Each comparison used fresh GPT-Live sessions, unchanged 200–400 ms playout buffering, and the same verified caller PCM through a test-only speech replay fixture. The simulator preserved target output. These are small controlled experiments, not a production latency benchmark; the standard commands above still generate fresh speech clips.

| Policy treatment                                                                            | Original prompt: first 200 ms quiet after caller onset | Treatment: first 200 ms quiet after caller onset |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| Explicit immediate yielding, with a separate acknowledgment policy                          | 1,460 / 1,420 ms; median 1,440 ms                      | 1,520 / 1,460 / 1,700 ms; median 1,520 ms        |
| Stop at first caller speech, classify the request afterward, resume after an acknowledgment | 1,300 / 1,080 / 1,740 ms; median 1,300 ms              | 1,480 / 1,440 / 1,580 ms; median 1,480 ms        |

All recorded comparison cases met the declared activity screen and answered correctly. The first comparison also retained a connection failure with no recording; it contributes no latency observation. Neither prompt treatment improved the frozen quiet-window metric, so the original example prompts remain. One first-comparison recording had later target activity after its initial quiet window, which is another reason to inspect the sound instead of treating the table as exact semantic yielding latency.

Packet inspection separated upstream delay from local queue time. A smaller adaptive-reserve rule saved only 60 ms in one replay and reintroduced a 20 ms speech underflow in a historical capture; it was rejected. Application playback suppression would be a separate treatment with its own lost-audio, context, and acknowledgment checks. Muting the target at the scheduled cue would not demonstrate faster native GPT-Live behavior.

The frozen signal grader detected all six development mutations and all seven mutations from a different held-out source when supplied with the correct hashed reference, with zero alarms on two and four labeled negative controls respectively. Reference-free detection caught only four of six and three of seven. Natural-pause sources were retained as observations, outside those false-alarm denominators. The saved 200 ms live gap was flagged from PCM; the saved 80 ms live gap required bound playout-counter evidence. Two older 20 ms gaps remain below the generic 40 ms signal threshold and require packet reconstruction. These distinctions are part of the result, not exceptions to omit from the report.

Across both comparisons and the fresh-speech, unfamiliar-wording, and acknowledgment checks, 20 live attempts produced 19 recordings. Sixteen original evals passed. The four retained failures were a connection refusal before audio, a caller requesting unsupported delegation, a target transport-underflow failure, and a malformed test assertion. The last assertion was corrected and checked against the saved response offline; its original failure was not rewritten as a successful live run. One acknowledgment occurred during target silence and therefore did not test resistance to an active backchannel.

The transport failure contained two 20 ms gaps at 11.140–11.160 s and 11.860–11.880 s, before the caller's cue. Its 960 ms quiet-window delay is not a clean fast-yield result. Packet replay proved the gaps, and the new hash-bound counter check failed the audio grade even though the stereo audio model returned `no_issue_flagged`. Reducing interruption delay and eliminating all underflows remain unresolved.

Independent review covered 48 unique transcription inputs, all 19 stereo recordings and 38 isolated tracks, plus one diagnostic crop. Every raw output was inspected. The 58 audio-model responses included 35 `no_issue_flagged`, 22 `review_required`, and one malformed JSON response; these are reviewer outputs, not recording-quality labels. Several concerns treated expected isolated-track silence or deliberate overlap as defects. ASR omitted a verified caller question in one track; disagreements about a later target sound remained unresolved after reviewing a lossless crop. This was manual data inspection plus direct audio-model review, not human listening.

Twelve fresh held-out audio-model calls also tested the frozen controls. Excluding the observational natural-pause row, the model matched only 5 of 11 expected statuses, including invented speech on digital silence and an incorrectly completed truncated date. Reference-aware signal and combined scoring matched 11 of 11 statuses and caught all seven injected defects, with no alarms on four negative controls. The model's sole nominal defect-category hit described an ordinary date correction rather than convincingly locating the injected repetition. No reliable improvement in model-only grading was demonstrated. These small engineering-control results do not establish perceptual accuracy on arbitrary conversations.

## Report what was demonstrated

For each repetition, retain validity, task result, interaction eligibility/result, audio observations, and unresolved review separately. Report failed and unexercised cases alongside successes. For small batches, list raw timing values and ranges; a percentile over a handful of calls is not a production latency guarantee. Do not mix request-level latency with per-call averages.

This walkthrough covers synthetic callers, a local task fixture, and local delivered recordings. It does not establish microphone, accent, multilingual, PSTN/WebRTC, load, or human-rated naturalness performance. Add approved real recordings and representative conditions before making those claims. [Pipecat's scenario documentation](https://docs.pipecat.ai/pipecat/evals/simulated-scenarios) and [Coval's metric definitions](https://docs.coval.ai/concepts/metrics/types/statistical) are useful comparisons, but check their turn and latency definitions before comparing numbers.
