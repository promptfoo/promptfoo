---
title: Testing GPT-Live voice agents
description: Test a GPT-Live café host with corrected reservations, interruptions, phantom pastries, booking checks, and audio review that catches more than good manners.
sidebar_label: Testing GPT-Live
---

# Testing GPT-Live voice agents

**A table for two. Preferably on the right day.**

Imagine you run **Bean There**, a café with a cheerful voice host and an impressively long menu. Maya calls to book a table. Halfway through her request, she corrects the date: August seventh—sorry, August sixth.

The host can sound delightful and still put the wrong date in the booking system. It can also save the right reservation while talking over Maya, swallow a word in the confirmation, or invent a chocolate croissant on the way out.

Let's give it an audition.

We'll use the [simulated voice user](/docs/providers/simulated-voice-user/) to connect a GPT-Live host and a GPT-Live caller, then inspect what happened in the conversation **and** the booking ledger. Bean There is our fictional setting; the runnable examples are separate reservation and café-information scenarios, each with its own prompt and facts. The reservation scenario knows nothing about the menu.

This is a realistic application to practice on. [Texas de Brazil uses Slang AI with OpenTable](https://www.slang.ai/customers/texas-de-brazil) for phone reservations and modifications. Appointment scheduling follows a similar pattern: [Bill Joplin's HVAC uses ServiceTitan's voice agent](https://www.servicetitan.com/press/bill-joplins-air-conditioning-and-heating-books-over-90-of-calls-with-servicetitan-ai-voice-agent) to answer calls and book jobs. Those deployments are examples of the workflow, not evidence about GPT-Live's performance.

## Define independent outcomes

Give the host four separate grades:

| Question                         | At Bean There                                                        | Evidence to check                                                  |
| -------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Did the test happen as intended? | Maya actually said the date correction.                              | Delivered caller audio, connection and capture status.             |
| Did the task succeed?            | Exactly one table for Maya, on August 6.                             | Tool arguments, saved reservation, and the confirmation she heard. |
| Did the conversation work?       | A correction stops the host; “mm-hmm” lets it continue.              | Audio around the interruption and the useful answer afterward.     |
| Did it sound usable?             | The confirmation has no missing words, repeats, or unexplained gaps. | Playback, signal checks, and independent audio review.             |

Keep these grades separate. “Your table is booked” is a claim to verify, and a green factual score says nothing about a missing syllable.

OpenAI's [GPT-Live evaluation guide](https://developers.openai.com/cookbook/examples/audio/voice_agent_evaluation) follows spoken intent through tool execution and final application state. It also distinguishes controlled speech, recorded inputs, and independent simulated callers. Start with a small, checkable task, then add conversational trouble.

## Run the example from source

The walkthrough tests configured GPT-Live sessions and a local reservation fixture. It does not place a telephone call or contact a real restaurant. For recorded-input tests and backend options, see the [GPT-Live provider](/docs/providers/openai-live/).

Use a checkout containing the example. While the feature is unreleased, use [the implementation PR's branch](https://github.com/promptfoo/promptfoo/pull/6811); an older `promptfoo@latest` installation won't contain it. From the repository root:

```bash
nvm use
npm ci
npm run build
```

Keep an existing project key in a private environment file. It needs access to `gpt-live-1` and the configured backend/grader models:

```bash
VOICE_ENV_FILE=/absolute/path/to/openai.env
```

Now run **one reservation call**:

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

The prepared caller clip requests a table for Maya, corrects August 7 to **August 6, 2027**, and asks for **7 PM, two people**. The backend tool deliberately takes two seconds. This gives the host something more demanding to do than sound agreeable.

This run uses two paid voice sessions, speech synthesis, a delegated backend, and a text grader. The transcription and audio-review steps below add paid requests.

For another reservation call, run the whole block again to get a fresh, empty ledger and a unique run ID. **Don't use `--repeat` with a shared reservation ledger.** Export each call before switching to another run directory.

## Verify an actual operation

**Check the table, not just the table manners.**

The `reservation_state` assertion checks that the caller voiced the correction, exactly one successful reservation was saved with the corrected details, and the caller heard the tool-returned confirmation code. The code isn't planted in the caller or target prompt.

Inspect `reservation-ledger.jsonl` in `$VOICE_EVAL_STATE_DIR` alongside the result and recording. The fixture accepts valid wrong dates too: a bad booking must be caught by the evaluator. Duplicate reservations and invented confirmation codes also fail.

Then try **“the booking system went out for lunch.”** After exporting your first call, rerun the booking block with a fresh directory and:

```bash
export VOICE_EVAL_TOOL_MODE=unavailable
```

Set that value **before** the eval command, replacing `available` in the block. The same tool now fails after its delay. A good host explains that no reservation was made; it doesn't invent a confirmation code or quietly retry. The assertion requires one correctly specified failed attempt and no saved booking. The failure mode is hidden from both conversational prompts.

Keep the ledger, run ID, and backend mode when regrading. The ledger establishes what was saved and where the code came from. It does not provide a shared tool/audio clock precise enough to prove the millisecond when the host began confirming; review apparent early confirmations separately.

## Export a portable recording bundle

Bring the receipt **and** the recording.

Using the same `PROMPTFOO_CONFIG_DIR` as the call, export it before running any separate review evals:

```bash
node dist/src/main.js export eval latest --include-media \
  -o "$VOICE_RUN_DIR/portable.json"

node examples/simulated-voice-user/export-evidence.js \
  "$VOICE_RUN_DIR/portable.json" --out "$VOICE_RUN_DIR/review"
```

Here, `latest` works because the state directory belongs to this run. If you've run another eval there, use the printed voice-eval ID instead.

Open `review/index.html` in a browser. You'll find the stereo conversation, separate speaker tracks, transcript fragments, original grades, hashes, and a review template. **The host is on the left; the caller is on the right.** Playback and seeking work locally without a server.

Listen to the complete call at normal speed, then isolate each speaker. Revisit the correction, the answer, suspicious pauses, and the goodbye. Note the time range, speaker, observation, and uncertainty. Did the host say the wrong date, did the recognizer hear the wrong date, or did part of the spoken date never reach the caller? Those require different fixes.

The helper verifies referenced recordings and accepts bounded inline WAVs, including very short recordings and `PROMPTFOO_INLINE_MEDIA=true` results. Missing or corrupt media produces a partial manifest and a nonzero exit. Inspect that failure before running paid reviews; an empty test list is not a reviewed call. `manual-review.json` begins as **not reviewed**; opening the player doesn't change that into a listening result.

## Transcribe and review the actual audio

Use three complementary checks.

**First, inspect the signal.** This step makes no model requests:

```bash
node examples/simulated-voice-user/grade-audio-signal.js \
  --tests "$VOICE_RUN_DIR/review/audio-review-tests.json" \
  --out "$VOICE_RUN_DIR/signal-review.json"
```

It checks silence, clipping, repeated PCM, suspicious zero gaps, and transport-underflow evidence bound to the recording's hash and speaker. Keep a failing report. A zero region can be an ordinary pause; a recorded underflow is evidence that the relay ran out of audio. Zero underflow doesn't rule out every defect.

**Second, get independent transcripts** of the delivered speaker tracks:

```bash
node --env-file="$VOICE_ENV_FILE" dist/src/main.js eval \
  -c examples/simulated-voice-user/promptfooconfig.transcription.yaml \
  --tests "$VOICE_RUN_DIR/review/transcription-tests.json" \
  --max-concurrency 1 --no-cache -o "$VOICE_RUN_DIR/transcriptions.json"
```

Don't give the transcriber the expected words. Compare its output with the script and listener recognition afterward. ASR can omit a short goodbye, finish a word that was cut off, or invent speech over silence. Preserve disagreements.

**Third, let an audio model review the WAV itself:**

```bash
node --env-file="$VOICE_ENV_FILE" dist/src/main.js eval \
  -c examples/simulated-voice-user/promptfooconfig.audio-review.yaml \
  --tests "$VOICE_RUN_DIR/review/audio-review-tests.json" \
  --max-concurrency 1 --no-cache -o "$VOICE_RUN_DIR/audio-review.json"
```

This sends actual audio to `gpt-audio-1.5`, with the track's role so it knows when one participant is intentionally absent. It returns `no_issue_flagged`, `review_required`, or `unratable`. Invalid responses fail validation.

**“No issue flagged” is advisory.** The eval keeps `audio_signal_integrity` separate from `audio_no_issue_flagged`: an enthusiastic model review cannot erase a measured gap. Digital silence remains unratable even if the model supplies a transcript. A claimed stereo overlap is rejected at that timestamp when either channel is exactly zero.

Audio-model review and human listening are different evidence. In our tests, models recovered speech missed by ASR but also missed real gaps. Use the disagreement as a reason to inspect the recording.

## Exercise interruption and backchannel behavior

The reservation call tests a corrected request. Its prepared clip starts at 1.5 seconds; that alone doesn't prove the caller interrupted an actively speaking host. For that, give the café a few separate rehearsals.

| Rehearsal                        | Configuration in `examples/simulated-voice-user/` | What should happen                                                                                |
| -------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **The decaf deadline**           | `promptfooconfig.yaml`                            | Answer Saturday closing time, then the decaf cutoff.                                              |
| **The menu that wouldn't end**   | `promptfooconfig.active-interruption.yaml`        | Stop the continuous announcement, answer the new question, and leave the old announcement behind. |
| **Excuse me, about the coffee…** | `promptfooconfig.interruption.yaml`               | Yield during a slower menu listing and answer the decaf question.                                 |
| **Mm-hmm is not a stop sign**    | `promptfooconfig.backchannel.yaml`                | Continue from the current place and reach the final item: banana bread.                           |

The café's baseline fact sheet says it closes at **4 PM on Saturdays**, serves decaf until **3 PM**, and has muffins, croissants, and banana bread. It supplies no muffin flavors, croissant varieties, or prices. Individual scenarios explicitly add the facts they need.

This is where **the phantom chocolate croissant** enters the story. A host can give the right closing time and then invent pastries, prices, or policies. `completed_goals` checks whether the caller got the requested answers; `grounded_facts` checks unsupported claims, including extras after a correct answer. A correct “3 PM” doesn't cancel an invented “chocolate.”

To run the continuous-announcement rehearsal:

```bash
VOICE_RUN_DIR="$(mktemp -d)"
export PROMPTFOO_CONFIG_DIR="$VOICE_RUN_DIR/state"

node --env-file="$VOICE_ENV_FILE" dist/src/main.js eval \
  -c examples/simulated-voice-user/promptfooconfig.active-interruption.yaml \
  --repeat 2 --max-concurrency 1 --no-cache \
  -o "$VOICE_RUN_DIR/results.json"
```

Use the same pattern with another configuration, choosing a fresh run directory each time. Then export and review that batch using the steps above.

The continuous-announcement cue arrives at twelve seconds; the slow-menu and backchannel cues arrive at nine. A scheduled question that lands in silence hasn't tested interruption. Verify active host speech just before the cue and that the announcement was unfinished. The goal is a host that yields, answers, and stays on the new topic—not one that takes a breath and resumes the monologue.

Two repetitions keep this walkthrough small. For a comparison, freeze prompts, voices, model identifiers, deadlines, and criteria, then run more repetitions and retain every result. Fresh speech synthesis can change the spoken stimulus: identical scripts aren't identical audio. Verify the clip's words independently and retain its hash.

<details>
<summary>Timing checks for a fair interruption test</summary>

The exporter calls a continuous-announcement opportunity mechanically eligible when the preceding second contains at least 300 ms of active target audio, including at least 20 ms in the last 100 ms. Activity uses 20 ms RMS windows at −40 dBFS. Confirm the unfinished announcement by reviewing the sound too.

After exporting this batch, check its eligibility:

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

The configured 50 ms dispatch benchmark checks the harness, not the host's yielding speed. A first 200 ms quiet window is not necessarily final cessation: inspect `targetActivityAfterFirst200MsQuiet` and the recording for resumed speech. Conversely, an agent can stop exactly at caller onset, so don't require positive overlap.

These are local delivered-audio measurements, not remote speaker-playback measurements. ASR event receipt isn't an exact word boundary, and source-packet arrival includes network and server delay. See the [reference metric contract](https://github.com/openai/openai-cookbook/blob/main/examples/audio/duplex_voice_agent_evaluation/docs/metrics-contract.md) and [LiveKit's simulation timing definitions](https://docs.livekit.io/testing/simulations/) before comparing results across harnesses.

Include a source-stall regression too: a quiet frame followed by a short queued speech tail must eventually drain. A zero-underflow counter can otherwise hide audio held indefinitely in a queue. The simulator bounds added replenishment padding while non-quiet audio is queued by its current reserve, normally 200–400 ms.

</details>

## Compare explicit application barge-in

There are two useful experiments: measure how the model yields on its own, and measure how your application controls playback. Label them separately.

Native yielding is the default. `promptfooconfig.app-barge-in.yaml` adds an explicit playback controller and a paid `gpt-live-transcribe` connection. Run and export it with the same commands, substituting that configuration.

The demo says “Wait a second, when does decaf end on Saturday?” The narrow detector can recognize that multiword command once a following delimiter arrives. A bare “Stop” waits for completed transcription, which can arrive after another caller segment starts or after the model has already stopped speaking. The demo must still record an actual application stop and recovery; answering the question alone does not exercise the controller, and this wording does not guarantee a particular delay.

The relevant option lives under the simulated-user provider's `config`:

```yaml
targetPlayback:
  mode: app-barge-in
  transcriptionDelay: minimal
```

For a comparison, copy one scenario and keep its target prompt, caller script, voices, capture window, and common task/transport assertions fixed. In the native copy, use `targetPlayback: { mode: native }` or omit that setting entirely; remove app-only options such as `transcriptionDelay` and the `application_playback` assertion. Report application health separately.

**The supplied native and app demonstration files have different prompts and caller scripts; simply running both is not a matched benchmark.** Freshly synthesized `callerInterventions.text` also means the audio can differ between runs. An identical-PCM comparison needs a custom test harness that reuses a verified clip, as the development experiments did; the public intervention configuration accepts text or instructions, not an audio-file input.

The recognizer sees only caller PCM already accepted by the target. It doesn't see the test schedule or expected answer. On a recognized interruption during playback, the app clears queued audio and suppresses incoming target speech. It can therefore stop what the caller hears before the model itself finishes yielding.

Now test recovery. Can the host answer the new question? Does it restart the old announcement? Did the controller also swallow the answer? The application health assertion checks recognition completion, recovery, and byte accounting; it doesn't certify a latency target or a useful conversation.

This is a narrow English command policy, not general intent detection. A streamed “Please pause” might become “Please pause playback of the video.” “Hold on” might become “Hold on to my reservation.” Test these continuations and “mm-hmm” controls as well as clean “Stop” commands.

<details>
<summary>Playback, recovery, and source-audio details</summary>

The controller follows [application-owned playback control](https://developers.openai.com/api/docs/guides/voice-server-controls). It tells the target that suppressed speech was not heard. Recovery requires actual source PCM silence and caller silence; a packet stall cannot satisfy it. GPT-Live supplies no output turn ID or context-truncation acknowledgment, so recovery remains heuristic.

Target-source quiet uses 20 ms RMS windows at −60 dBFS; caller rejoining after a prepared clip uses −55 dBFS. The caller-rejoin policy also affects native tests. Quiet speech and pauses within an unfinished response remain limitations.

Exported `recordingAtMs` boundaries locate suppression in the WAV. Actual frame-acceptance time governs freshness. Legacy `detectionDelayMs` subtracts recorded caller onset from elapsed decision time; it is not an acceptance-to-detection latency. Older captures label their elapsed-time fallback.

The target-source WAV contains generated audio that may never have reached the caller. Its `source_sample_order` clock is separate from the delivered recording. Review it with `source-transcription-tests.json` and `source-audio-review-tests.json` in separate runs; don't use it to satisfy heard-answer assertions. Startup failures can retain source audio while explicitly reporting missing heard media. `recordConversation: false` disables both recordings.

The [transcription delay setting](https://developers.openai.com/api/docs/guides/realtime-transcription) is not a latency guarantee. Preserve `requestedDelay`, `delayAcknowledged`, and measured timing separately. Missing usage confirmation remains billing uncertainty. The recognition stream uses the target's configured origin and credentials, so a gateway must support both Live and Realtime transcription.

</details>

## Calibrate before trusting a score

Audition the judges too. If an audio grader hears a waiter on a digital-silence control, Bean There has acquired a ghost.

Use an exported reservation or interruption call containing `case-001-intervention-001.wav`. The source must contain at least two seconds of mono speech with enough active audio for the mutations. The unmodified caller track used as `--pause-source` must contain at least 500 ms of quiet between speech, followed by more speech; trailing silence alone does not qualify.

```bash
node examples/simulated-voice-user/calibrate-audio.js \
  --source "$VOICE_RUN_DIR/review/case-001-intervention-001.wav" \
  --pause-source "$VOICE_RUN_DIR/review/case-001-caller.wav" \
  --out "$VOICE_RUN_DIR/calibration"
```

The generator checks those requirements without making model requests. If it rejects an input, select another qualifying exported row and update the source paths. Run the paid review only after generation succeeds:

```bash
node --env-file="$VOICE_ENV_FILE" dist/src/main.js eval \
  -c examples/simulated-voice-user/promptfooconfig.audio-review.yaml \
  --tests "$VOICE_RUN_DIR/calibration/audio-review-tests.json" \
  --max-concurrency 1 --no-cache -o "$VOICE_RUN_DIR/calibration-results.json"

node examples/simulated-voice-user/score-audio-calibration.js \
  --labels "$VOICE_RUN_DIR/calibration/frozen-labels.json" \
  --results "$VOICE_RUN_DIR/calibration-results.json" \
  --out "$VOICE_RUN_DIR/calibration-score.json"
```

The generator preserves the originals and creates opaque test inputs: clean copies, gaps, repetition, clipping, truncation, and silence. The answer key stays separate from the model. The deterministic grader can compare against the independently hashed original; another synthesis of the same words is not that reference.

Some controls should fail the ordinary quality assertion, so an eval may exit nonzero and still produce the results needed by the scorer. Distinguish correctly detected defects from provider errors, malformed judgments, and abstentions. Count missed defects and clean-control false alarms. Freeze the policy before testing new clips, speakers, or edit positions.

For the phantom croissant and related factual mistakes, run `promptfooconfig.calibration.yaml`. The confirmation and order calibration configs add ambiguous yeses, incorrect propositions, and answers attributed to the wrong question. Compare each control's expected labels with the individual grades; the aggregate pass rate isn't calibration accuracy.

<details>
<summary>Check that the simulated caller stays in character</summary>

A caller can accidentally start answering as the café representative. Passing target assertions doesn't prove the rehearsal was valid. Review saved calls without creating new voice sessions:

```bash
node examples/simulated-voice-user/prepare-caller-review.js \
  "$VOICE_RUN_DIR/portable.json" --instructions-var instructions \
  --out "$VOICE_RUN_DIR/caller-review-tests.json"

node --env-file="$VOICE_ENV_FILE" dist/src/main.js eval \
  -c examples/simulated-voice-user/promptfooconfig.caller-review.yaml \
  --tests "$VOICE_RUN_DIR/caller-review-tests.json" \
  --max-concurrency 1 --no-cache -o "$VOICE_RUN_DIR/caller-review.json"
```

Supply the actual rendered instructions via `--instructions-file FILE` if they don't live in the `instructions` variable. The preparer identifies completely delivered harness scripts so scripted speech isn't mistaken for autonomous caller misconduct. A supplied script still doesn't prove its exact words were audible.

This adds one text-model request per row and returns `valid`, `invalid`, or `inconclusive`. Both invalid and inconclusive fail the advisory validity assertion. Findings must quote listener-recognized caller speech; reconcile disagreements against the recording. Use `caller-review-calibration.json` with the same config for its synthetic controls.

</details>

## What the live checks found

Bean There's audition produced useful failures. The earlier matched development pair used the same prepared caller PCM and eligible interruption opportunities:

| Check                                           | Observed result                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| Native first 200 ms quiet after caller onset    | **1,180 ms**                                                                         |
| App heard-stop bound after caller onset         | **940 ms**                                                                           |
| Relative reduction in those scoped measurements | **20.3%**; missed both the 750 ms and 25% improvement benchmarks                     |
| Original eval assertions                        | Native **7/7**, app **6/7**                                                          |
| Remaining audio defect                          | A **20 ms underflow at 11.060–11.080 s**, before the interruption                    |
| Independent audio review                        | Full answers and farewells corroborated; both heard-app audio reviews missed the gap |

The transport-backed grader caught the gap, so the app result remains a failure. Exact PCM showed speech delayed one frame without deleted or replaced source samples at that boundary; this doesn't establish that the gap was inaudible.

Earlier cases exposed missed “Stop” commands, an unsolicited caller echo, invented menu details, and audio reviewers inventing defects. Before the café walkthrough rerun, **247 recording-review requests—108 ASR and 139 direct audio-model requests—**were inspected alongside transcripts, PCM, and packet data. Those are review requests, not 247 independent conversations or human listening sessions.

A [from-scratch café walkthrough check](/docs/guides/testing-gpt-live-results/#cafe-walkthrough-check-october-11-2026) then completed 14 calls and verified both booking outcomes. It exposed two app runs with no application stop, prompting the demo's “Wait a second” cue correction. Both revised runs stopped and recovered, with **840 ms and 740 ms** heard-stop bounds. The original failures remain; these differently scripted examples are not a matched native/app comparison or a latency guarantee.

The [full development results](/docs/guides/testing-gpt-live-results/) retain the older cohorts, prompt experiments, calibration outcomes, and disagreements. This small development sample establishes neither reliable sub-750 ms interruption nor universally gap-free audio.

## Report what was demonstrated

For each call, keep the original grade, booking state, caller validity, interruption eligibility, timing, and audio observations. Record failed and unexercised cases alongside successes. With a small batch, show individual timings and ranges; a percentile over a handful of calls isn't a production guarantee.

This walkthrough covers synthetic callers, a local booking fixture, and local delivered recordings. Microphones, accents, multilingual callers, telephone/WebRTC paths, load, and human-rated naturalness need representative tests of their own.

Once the café works, give it a busier shift. **These are extensions to implement, not capabilities of the supplied fixture:**

| Next scenario                | A little personality                                   | A serious check                                                      |
| ---------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------- |
| A sold-out restaurant        | “Can you fit six of us? One is very small.”            | Respect capacity; offer an actually available alternative.           |
| Changing an existing booking | The birthday organizer changes the plan again.         | Modify the authorized reservation without creating a duplicate.      |
| A dog groomer                | Book a trim for Professor Waffles.                     | Correct pet, service, duration, and appointment slot.                |
| A home-repair scheduler      | The boiler has chosen Friday night to become dramatic. | Preserve the address, service window, and verified dispatch details. |
| A hotel reservation desk     | A quiet room, away from the elevator, please.          | Use actual availability and avoid invented amenities or guarantees.  |

Hotels are another real application: [Golden Nugget's PolyAI deployment](https://poly.ai/customers/golden-nugget) handles reservation calls and guest questions. Adapt the task and its authoritative data, then keep following the request all the way into saved state and back to what the caller heard.

A useful first milestone is modest: one correctly booked table, one honest failure, one interruption handled well, and recordings you can explain. The chocolate croissant can wait until somebody puts it on the menu.
