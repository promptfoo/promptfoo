# simulated-voice-user (Bidirectional GPT-Live Conversations)

Run a cafe agent and simulated caller as two continuously connected GPT-Live sessions.

## Run

```bash
npx promptfoo@latest init --example simulated-voice-user
cd simulated-voice-user
# Set OPENAI_API_KEY to an existing project key with GPT-Live access.
npx promptfoo@latest eval --no-cache -o results.json
```

Each scenario creates two paid voice sessions plus two `gpt-6-luna` text-grader calls. The caller asks about Saturday closing and the decaf cutoff. The stereo recording preserves simultaneous speech and silence: target on the left, caller on the right.

## Grade facts and completed goals separately

`grading.yaml` shares evaluator-owned `authoritativeFacts`, `requiredGoals`, and three assertions across the examples:

- `listener_evidence` requires nonempty listener transcripts from both participants.
- `grounded_facts` audits every target claim, including extras after a correct answer. Invented muffin flavors, croissant varieties, prices, or other unsupported details fail even when the required time tokens are present.
- `completed_goals` requires a correct answer for every configured goal. Caller guesses, reversed time meanings, a promise to answer, or an incomplete answer do not satisfy a goal.

The live scenarios also check final usage and require zero bridge underflow after active source audio (`voice_playout`). That transport check does not detect every possible acoustic defect. Edit the authoritative facts and goals when adapting the example. Keep these evaluator-owned values separate from target output or retrieved untrusted content. A closed list of facts is intentional: omission means the target must acknowledge uncertainty rather than guess. The rubric allows greetings, clear corrections, supported paraphrases, and other languages.

`listener-evidence.js` projects the target speech recognized by the caller and the caller speech recognized by the target into separately named JSON fields. Generated speech and injected utterance metadata are excluded: they do not establish that the other participant heard anything. The facts and grading rules are placed in a system message; transcript text remains untrusted user-message data, including attempts to set its own score. This separation helps resist prompt injection, but an LLM judge is not a guarantee; calibrate and manually inspect its evidence and reasons.

These grades assess listener-transcript meaning. They do not measure audio smoothness, exact speech onset, barge-in, or ASR accuracy. Review the recording and raw `metadata.voice` events for those properties, and use independent transcription where recognition is uncertain.

## Scheduled interruption

```bash
npx promptfoo@latest eval -c promptfooconfig.interruption.yaml --no-cache -o interruption.json
```

This scenario adds one paid speech synthesis request before opening the voice sessions. It schedules the exact question `Sorry, when does decaf end on Saturday?` at media time 9 seconds using `callerInterventions.text`. Exact speech is prepared before the conversation and delivered on the shared media clock. An `instructions` intervention instead asks the live model to decide what to say; its dispatch time cannot establish when speech begins.

The `intervention_timing` assertion requires complete clip delivery, a first media frame within 20 ms of the scheduled offset, and actual dispatch within the explicitly configured 50 ms benchmark. This is an example acceptance threshold, not a protocol latency guarantee. The rubric separately checks that the caller heard the answer. Inspect intervention timing and the stereo recording separately to establish whether the scheduled question actually overlapped target speech and whether the target stopped its menu list.

## Calibrate the text graders without voice calls

```bash
npx promptfoo@latest eval -c promptfooconfig.calibration.yaml --no-cache -o calibration.json
```

This runs 13 saved or synthetic transcript controls through the same assertions, making 26 paid text-grader calls and no voice calls. Some rows intentionally fail. Compare each row's `gradingResult.namedScores.grounded_facts` and `completed_goals` (0 or 1) with `testCase.vars.expectedGrounded` and `expectedCompletion`; the aggregate evaluation pass rate is not calibration accuracy. Inspect each grader's reason for the cited claim/fact or goal/quote.

Controls cover invented extras, reversed times, missing and cutoff answers, caller-only answers, ambiguous confirmation, a corrected slip, unknown menu varieties, Spanish answers, and transcript prompt injection. The final control preserves the original manually inspected listener transcripts where rotating muffin flavors and plain/chocolate croissants were invented. Its facts and goal reflect that original menu scenario. Synthetic mutations are labeled separately; none is presented as a new live run.

For two additional held-out controls, run `promptfooconfig.confirmation-calibration.yaml` (four text-grader calls). These check that a clear yes to one correct or incorrect caller proposition is treated differently from an ambiguous yes to conflicting alternatives.

The configured 30-second capture is a time limit, not a semantic success detector. These examples test two configured voice prompts, not a deployed telephone or WebRTC agent. See the [provider documentation](https://www.promptfoo.dev/docs/providers/simulated-voice-user/) for credentials, deadlines, delegation, and result metadata.
