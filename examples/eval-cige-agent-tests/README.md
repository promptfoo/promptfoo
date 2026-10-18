# eval-cige-agent-tests (CIGE Agentic Test Cases)

This example runs [CIGE](https://www.amazon.science/publications/cige-an-agentic-ai-test-case-standard) (Context, Intent, Guardrails, Execution) test cases in promptfoo, using only existing extension points: a JavaScript test generator, a custom provider and a JavaScript assertion. It needs no API keys and no extra dependencies.

It demonstrates two things that a prompt plus post-run assertions cannot express on its own:

- **Guardrails are enforced before a tool runs.** A forbidden call is blocked at the gate and never reaches the tool.
- **A successful tool response is not the same as a satisfied intent.** A run can reach the right state and still fail because the required evidence is missing.

## Quick start

```bash
npx promptfoo@latest init --example eval-cige-agent-tests
cd eval-cige-agent-tests
npx promptfoo@latest eval
npx promptfoo@latest view
```

## Expected results

Not every case should pass. Three of the four cases are negative controls, so `promptfoo eval` reports 1 pass, 2 failures and 1 error and exits with a non-zero code:

| Case | What happens                                                                                           | Result                                            |
| ---- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| C1   | Healthy session; every tool succeeds and all required evidence is captured                             | Pass                                              |
| C2   | The path tries `delete_session`; the gate blocks it before dispatch                                    | Fail: forbidden call attempted                    |
| C3   | Same CIGE case as C1; every tool succeeds and the UI says "Connected", but the connection log is empty | Fail: required evidence missing: `connection_log` |
| C4   | A mandatory guardrail needs human approval, which this runner cannot enforce                           | Error: preflight refusal, no tool calls made      |

Each graded result has three components, also reported as named scores: `outcome`, `evidence` and `guardrails`. C3 shows the difference: `outcome` is 1, `evidence` is 0, and the test fails.

## How it works

| File                    | Role                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `cases/*.cige.yaml`     | The CIGE test cases, the source of truth                                                    |
| `cige-tests.mjs`        | Adapter: validates each case and passes the complete CIGE object to the test as `vars.cige` |
| `cige-runner.mjs`       | Custom provider: preflight, pre-dispatch tool gate, output redaction, evidence capture      |
| `cige.mjs`              | Shared validation, gate and grading logic, plus the `assertIntent` assertion                |
| `streaming-fixture.mjs` | Deterministic stand-in for a workspace streaming service                                    |

Promptfoo parses each `case: file://cases/....cige.yaml` entry in `promptfooconfig.yaml` before calling the adapter, so the example needs no YAML library. The `fixture` entry next to a case changes only the local environment, not the test. That is how C1 and C3 run the same CIGE file.

The runner is scripted: it follows `execution.initial_path` step by step. Every step goes through the gate first. A blocked step is recorded and skipped, and the fixture keeps a list of the calls it actually received (`received` in the output). That list is how you can see that the blocked `delete_session` call never arrived.

## CIGE subset used here

CIGE defines the four top-level fields but no canonical subfields. This example supports the following subset:

- `context.tools`: tool names the agent may call. Anything else is blocked.
- `intent.success_criteria`: each criterion has a `check` with a `path` into the observed state and one of `equals`, `lte` or `gte`. A criterion without a `check` fails as unverifiable instead of passing silently.
- `intent.required_evidence`: artifact names that must be captured and non-empty.
- `guardrails`: a plain string is advisory. It is listed in the result but not enforced by the runner. An object can declare `enforce` with `deny_tools` or `forbid_output_pattern`. If a guardrail marked `mandatory: true` uses any other enforcement kind, the runner refuses to start.
- `execution.initial_path`: a list of `{ tool, args }` steps, treated as the suggested path.

`context.reveal_policy` is accepted but not implemented here; the runner reports it under `notImplemented` in its output.

## Extending it

- **Use a real agent.** Replace the scripted loop in `cige-runner.mjs` with an LLM tool-calling loop, and keep every tool call going through `checkToolCall` before dispatch.
- **Use real tools.** Replace `streaming-fixture.mjs` with an MCP client or a staging environment. An external policy gate can sit at the same point as `checkToolCall`.
- **Add enforcement kinds.** Add them to `SUPPORTED_ENFORCEMENT` and `checkToolCall` in `cige.mjs`. Until a kind is supported, a mandatory guardrail that uses it stops the run.

## Limits

This is a deterministic local example. It does not measure model behaviour, and it does not implement the paper's staged context reveal, failure classification, execution-path repair or human approval workflow.
