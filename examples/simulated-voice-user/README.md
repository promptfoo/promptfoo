# simulated-voice-user (Bidirectional GPT-Live Conversations)

Run a cafe agent and simulated caller as two continuously connected GPT-Live sessions.

The [GPT-Live testing guide](https://www.promptfoo.dev/docs/guides/testing-gpt-live/) covers repeatable scenarios, actual tool outcomes, portable recordings, listening, independent transcription, and audio-review calibration.

## Run

While this provider is unreleased, use a checkout containing these changes and run from the repository root:

```bash
nvm use
npm ci
npm run build
node --env-file=/absolute/path/to/openai.env dist/src/main.js eval \
  -c examples/simulated-voice-user/promptfooconfig.yaml --no-cache -o results.json
```

Once your installed version contains the provider and example:

```bash
npx promptfoo@latest init --example simulated-voice-user
cd simulated-voice-user
# Set OPENAI_API_KEY to an existing project key with GPT-Live access.
npx promptfoo@latest eval --no-cache -o results.json
```

The remaining commands use the source checkout's repository root. In an installed example directory with `OPENAI_API_KEY` set, replace the `node --env-file=... dist/src/main.js` CLI prefix with `npx promptfoo@latest`, and remove `examples/simulated-voice-user/` from configuration and helper paths. For the export command, replace `node dist/src/main.js` with `npx promptfoo@latest` too.

The baseline creates two paid voice sessions plus two `gpt-6-luna` text-grader calls. The caller asks about Saturday closing and the decaf cutoff. Prepared interventions add a speech-synthesis request; the reservation case also calls a delegated backend and uses one text grader. The stereo recording preserves simultaneous speech and silence: target on the left, caller on the right.

## Grade facts and completed goals separately

`grading.yaml` shares evaluator-owned `authoritativeFacts`, `requiredGoals`, and three assertions across the examples:

- `listener_evidence` requires nonempty listener transcripts from both participants.
- `grounded_facts` audits every target claim, including extras after a correct answer. Invented muffin flavors, croissant varieties, prices, or other unsupported details fail even when the required time tokens are present.
- `completed_goals` requires a correct answer for every configured goal. Caller guesses, reversed time meanings, a promise to answer, or an incomplete answer do not satisfy a goal.

The live scenarios also check final usage and require zero bridge underflow after active source audio (`voice_playout`). That transport check does not detect every possible acoustic defect. Edit the authoritative facts and goals when adapting the example. Keep these evaluator-owned values separate from target output or retrieved untrusted content. A closed list of facts is intentional: omission means the target must acknowledge uncertainty rather than guess. The rubric allows greetings, clear corrections, supported paraphrases, and other languages.

`listener-evidence.js` preserves listener-recognized speech in observed event-arrival order with fixed target/caller speaker labels. Only consecutive fragments from the same speaker are joined. A confirmation can refer to a clear preceding question, never a later one; older aggregate-only fixtures explicitly mark order unavailable and cannot use a bare “yes” to establish a claim or complete a goal. Generated speech and injected utterance metadata are excluded: they do not establish that the other participant heard anything. The facts and grading rules are placed in a system message; transcript text remains untrusted user-message data, including attempts to set its own score. This separation helps resist prompt injection, but an LLM judge is not a guarantee; calibrate and manually inspect its evidence and reasons.

These grades assess listener-transcript meaning. They do not measure audio smoothness, exact speech onset, barge-in, or ASR accuracy. Review the recording and raw `metadata.voice` events for those properties, and use independent transcription where recognition is uncertain.

## Scheduled interruption

```bash
node --env-file=/absolute/path/to/openai.env dist/src/main.js eval \
  -c examples/simulated-voice-user/promptfooconfig.interruption.yaml \
  --no-cache --max-concurrency 1 -o interruption.json
```

This scenario adds one paid speech synthesis request before opening the voice sessions. It prepares the question `Sorry, when does decaf end on Saturday?` and schedules its audio at media time 9 seconds using `callerInterventions.text`. The prepared audio is delivered on the shared media clock. Verify the spoken words too: synthesis can omit or change text, even when every prepared audio sample arrives. An `instructions` intervention instead asks the live model to decide what to say; its dispatch time cannot establish when speech begins.

Each rendered intervention `text` and `instructions` value must contain 1–500 UTF-8 bytes. This is a deliberately conservative local budget for GPT-Live's [500-token append limit](https://developers.openai.com/api/docs/guides/live-conversations#add-context-during-the-conversation), not an exact token count; some text the API could accept will exceed this local budget. Authored templates may contain up to 2000 UTF-8 bytes, but rendered values are checked before speech synthesis or Live session preparation.

The `intervention_timing` assertion requires complete clip delivery, a first media frame within 20 ms of the scheduled offset, and actual dispatch within the explicitly configured 50 ms benchmark. This is an example acceptance threshold, not a protocol latency guarantee. The rubric separately checks that the caller heard the answer. Inspect intervention timing and the stereo recording separately to establish whether the scheduled question actually overlapped target speech and whether the target stopped its menu list.

## Calibrate the text graders without voice calls

```bash
node --env-file=/absolute/path/to/openai.env dist/src/main.js eval \
  -c examples/simulated-voice-user/promptfooconfig.calibration.yaml \
  --no-cache --max-concurrency 1 -o calibration.json
```

This runs 13 saved or synthetic transcript controls through the same assertions, making 26 paid text-grader calls and no voice calls. Some rows intentionally fail. Compare each row's `gradingResult.namedScores.grounded_facts` and `completed_goals` (0 or 1) with `testCase.vars.expectedGrounded` and `expectedCompletion`; the aggregate evaluation pass rate is not calibration accuracy. Inspect each grader's reason for the cited claim/fact or goal/quote.

Controls cover invented extras, reversed times, missing and cutoff answers, caller-only answers, ambiguous confirmation, a corrected slip, unknown menu varieties, Spanish answers, and transcript prompt injection. The final control preserves the original manually inspected listener transcripts where rotating muffin flavors and plain/chocolate croissants were invented. Its facts and goal reflect that original menu scenario. Synthetic mutations are labeled separately; none is presented as a new live run.

For two additional controls, run `promptfooconfig.confirmation-calibration.yaml` (four text-grader calls). These preserve the original held-out labels and provide explicit synthetic order for each one-question confirmation. They check that a clear yes to one correct or incorrect caller proposition is treated differently from an ambiguous yes to conflicting alternatives.

Run `promptfooconfig.order-calibration.yaml` for six additional chronology controls (12 text-grader calls). These distinguish a confirmation of an earlier audio check from an answer to a later closing question, detect unsupported menu confirmations, and require unordered confirmations to remain inconclusive. Compare their fixed labels with both metrics, including intentional failures.

The configured 30-second capture is a time limit, not a semantic success detector. These examples test two configured voice prompts, not a deployed telephone or WebRTC agent. See the [provider documentation](https://www.promptfoo.dev/docs/providers/simulated-voice-user/) for credentials, deadlines, delegation, and result metadata.

## Verify conversation behavior and application state

`promptfooconfig.active-interruption.yaml` starts with a supplied continuous announcement. It increases the chance that the scheduled question arrives during speech. Inspect the exported activity window and unfinished announcement before treating a run as an exercised interruption; a correct answer alone does not prove fast yielding.

`promptfooconfig.backchannel.yaml` asks the target to continue its menu after a brief acknowledgment. Inspect the recording for restarts or abandonment, rather than treating all overlap as a defect.

`promptfooconfig.reservation.yaml` tests a spoken date correction, a delayed backend tool, exactly one saved reservation, and recognition of a confirmation code revealed only by the tool. Each repetition needs a fresh, empty, absolute `VOICE_EVAL_STATE_DIR` and a unique `VOICE_EVAL_RUN_ID`; use one case per process with `--max-concurrency 1`. The fixture does not contact a real booking service. Keep its ledger with the recording when regrading.

Set `VOICE_EVAL_TOOL_MODE=available` for the normal case or `unavailable` for a controlled tool failure. The failure case requires a correctly specified attempt, no saved reservation, and an honest spoken failure response. Keep the mode with the ledger when regrading; neither mode is disclosed to the caller or target prompts.

## Export, listen, and transcribe

Use the same `PROMPTFOO_CONFIG_DIR` as the voice eval and its printed evaluation ID:

```bash
node dist/src/main.js export eval <eval-id> --include-media -o portable.json
node examples/simulated-voice-user/export-evidence.js portable.json --out new-review-directory
```

Run those commands from the repository root. Open the generated `index.html` to play the stereo conversation and separate speaker tracks. The helper verifies hashes and channel mapping, preserves partial failures, and creates `new-review-directory/manual-review.json` with status `not-reviewed`. Playback working is not evidence that a human listened. PCM zero-island and clipping measurements are review cues, not a blanket acoustic-quality verdict.

The generated `new-review-directory/transcription-tests.json` works with `promptfooconfig.transcription.yaml`; `new-review-directory/audio-review-tests.json` works with `promptfooconfig.audio-review.yaml`. Pass either with `--tests` to a separate eval using `--no-cache`. Transcription receives no reference text. Audio review sends the actual WAV to `gpt-audio-1.5`, validates its response, and keeps `no_issue_flagged`, `review_required`, and `unratable` separate. No-issue results remain advisory: the model can miss gaps or invent speech on silence. The independent no-signal guard refuses an all-zero recording regardless of model text.

`calibrate-audio.js` creates blinded, hashed mutation controls without API calls. `score-audio-calibration.js` compares their frozen labels with saved audio-review results, preserving misses, unknowns, and errors. See the guide for runnable commands and the distinction between known signal edits and human-rated audio quality.
