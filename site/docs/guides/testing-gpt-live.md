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

This uses `gpt-audio-1.5` through the existing Chat Completions provider. It returns `no_issue_flagged`, `review_required`, or `unratable`, with a transcript and observations. Invalid output fails validation. **No issue flagged is an advisory finding, not a quality certificate.** Exact silence must remain unratable even if the model invents a transcript.

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

Some calibration rows should fail the ordinary quality assertion, so that eval can exit nonzero while still producing its results. Run the scorer afterward; it also exits nonzero when calibration fails. Distinguish expected defect flags from provider errors, malformed judgments, missing results, and abstentions. Report every control and the denominator, including missed defects and clean-control false alarms. Keep the original outputs if you revise a rubric, and use new held-out cases for the revision. Recalibrate after changing the model or audio preprocessing.

The text-grader controls in `promptfooconfig.calibration.yaml`, `promptfooconfig.confirmation-calibration.yaml`, and `promptfooconfig.order-calibration.yaml` test invented facts and ambiguous confirmations independently of audio. A reliable test suite needs both semantic and acoustic controls.

## Report what was demonstrated

For each repetition, retain validity, task result, interaction eligibility/result, audio observations, and unresolved review separately. Report failed and unexercised cases alongside successes. For small batches, list raw timing values and ranges; a percentile over a handful of calls is not a production latency guarantee. Do not mix request-level latency with per-call averages.

This walkthrough covers synthetic callers, a local task fixture, and local delivered recordings. It does not establish microphone, accent, multilingual, PSTN/WebRTC, load, or human-rated naturalness performance. Add approved real recordings and representative conditions before making those claims. [Pipecat's scenario documentation](https://docs.pipecat.ai/pipecat/evals/simulated-scenarios) and [Coval's metric definitions](https://docs.coval.ai/concepts/metrics/types/statistical) are useful comparisons, but check their turn and latency definitions before comparing numbers.
