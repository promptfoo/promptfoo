# OpenAI Codex SDK Provider GAP Plan and E2E Test Runbook

This document captures the Codex provider audit findings, what was fixed, what remains unsupported by design, and how to validate the provider with real evals from the repository root.

## Current Capability Snapshot

| Area                                 | Supported | Notes                                                                                                                                           |
| ------------------------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider IDs                         | Yes       | `openai:codex-sdk`, `openai:codex`, and model suffix forms such as `openai:codex:gpt-5.4`.                                                      |
| Auth                                 | Yes       | Uses `config.apiKey`, `OPENAI_API_KEY`, `CODEX_API_KEY`, or existing Codex login state if no key is set.                                        |
| Final text output                    | Yes       | `response.output` is a string containing the Codex turn's final text response.                                                                  |
| Structured output                    | Yes       | `config.output_schema` is forwarded to the SDK, but promptfoo still returns `output` as a string.                                               |
| Token usage                          | Yes       | `response.tokenUsage` is populated when the SDK returns usage.                                                                                  |
| Cost estimate                        | Partial   | Estimated only when `config.model` matches the provider's static pricing table. Unknown/omitted models return `cost: 0`.                        |
| Ephemeral threads                    | Yes       | Default behavior.                                                                                                                               |
| Persistent threads                   | Partial   | `persist_threads` pools by prompt template + thread-affecting config. Direct `callApi` without `prompt.raw` falls back to rendered prompt text. |
| Explicit thread resume               | Yes       | `thread_id` resumes a session from Codex's session store.                                                                                       |
| Filesystem sandbox                   | Yes       | `sandbox_mode` is forwarded to Codex thread options.                                                                                            |
| Network/search controls              | Yes       | `network_access_enabled`, `web_search_enabled`, and `web_search_mode` are forwarded. `web_search_mode` wins over `web_search_enabled`.          |
| Approval policy                      | Yes       | `approval_policy` is forwarded to Codex thread options.                                                                                         |
| CLI config overrides                 | Yes       | `cli_config` is forwarded to the SDK constructor, and `collaboration_mode` is mapped into that object.                                          |
| CLI env isolation                    | Yes       | Promptfoo now defaults to a minimal shell env + explicit provider env/API keys. Full `process.env` is opt-in with `inherit_process_env: true`.  |
| Streaming traces                     | Yes       | `enable_streaming` turns Codex events into spans and still returns only the final response to promptfoo.                                        |
| Deep tracing                         | Partial   | `deep_tracing` injects OTEL env vars and requires a fresh SDK instance per call, so thread persistence is disabled in that mode.                |
| Skill usage assertions               | Partial   | `skill-used` and `metadata.skillCalls` are heuristic, inferred from direct `SKILL.md` command reads.                                            |
| Embeddings/moderation/image/realtime | No        | Use the standard `openai:*` providers for those APIs.                                                                                           |
| Sampling knobs                       | No        | No first-class `temperature`, `top_p`, `max_tokens`, `stop`, or `logprobs` fields.                                                              |

## Implemented Fixes from the Audit

| Gap                                                            | Fix                                                                                                                                                     | Validation                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Codex SDK instances were not registered for evaluator shutdown | Provider now registers with `providerRegistry` and exposes `shutdown()`                                                                                 | Unit tests plus normal evaluator shutdown path            |
| Timeout cleanup was fire-and-forget                            | Timeout handler now stores and awaits the provider cleanup promise before producing the timeout row                                                     | Unit/integration timeout paths                            |
| Default CLI env inherited full `process.env`                   | Default env is now minimal shell vars + `cli_env` + explicit provider env/API key; full inheritance is opt-in                                           | Unit tests and docs                                       |
| Package resolution missed promptfoo's own install path         | Loader now also searches the package roots around `src/` / `dist/src/`                                                                                  | Unit test with mocked external `cwd` and config base path |
| Strict config validation was missing                           | Provider now validates config with a strict Zod schema and returns provider errors for malformed prompt-level config                                    | Constructor and `callApi` unit tests                      |
| `collaboration_mode` docs did not match implementation         | Top-level `collaboration_mode` is now mapped into `cli_config.collaboration_mode`                                                                       | Unit test and docs                                        |
| Persistent threads were keyed by rendered prompt text          | Cache key now uses `prompt.raw` when available, so tests sharing one template can reuse a thread                                                        | Unit test and docs                                        |
| `working_dir` subdirectories failed Git checks                 | Validation now walks parent directories until it finds `.git`                                                                                           | Unit test and docs                                        |
| Setup failures threw before returning provider errors          | Validation/loading/thread setup now return `{ error }` rows instead of throwing                                                                         | Unit tests                                                |
| Trace spans leaked raw command/message/reasoning/output text   | Provider now applies best-effort redaction to command text, command output, agent messages, reasoning text, web-search text, MCP inputs, and MCP errors | Unit tests                                                |
| Docs/examples were stale or misleading                         | Provider docs and examples now document exact thread, sandbox, env, tracing, skill, and output semantics                                                | Docs review                                               |

## Remaining Gaps and Recommended Follow-Ups

| Priority | Gap                                                                             | Recommendation                                                                                                                                                                                            |
| -------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | `skillCalls` is still heuristic and depends on command text shape               | Track first-class Codex skill events if the SDK exposes them in a future release; until then, keep docs explicit and test with deterministic `SKILL.md` fixtures.                                         |
| P1       | Trace redaction is best-effort, not a formal DLP boundary                       | Keep production secrets out of prompts, fixture files, and shell command outputs used in evals. Consider adding opt-in trace suppression or allowlist-based span content capture.                         |
| P2       | No promptfoo-native live partial streaming surface                              | If needed, extend `ProviderResponse` / evaluator plumbing with an event callback contract; current streaming remains trace-only.                                                                          |
| P2       | No first-class sampling controls such as `temperature` / `top_p` / `max_tokens` | Check whether the current Codex SDK exposes stable equivalents through `cli_config`; if yes, add documented top-level fields with validation and tests.                                                   |
| P2       | Cost estimation depends on a static pricing table                               | Add a release checklist item to update pricing when new Codex models are added, and document that unknown models return `cost: 0`.                                                                        |
| P2       | No explicit output parsing mode                                                 | Consider an opt-in `parse_output_json: true` flag if users want `response.output` to become an object after schema-constrained turns.                                                                     |
| P2       | Interactive approval policies are awkward in unattended eval runs               | Consider docs warnings plus CI-oriented examples that default to `approval_policy: never` unless an eval intentionally tests permission prompts.                                                          |
| P3       | No provider-specific schema in the global JSON schema                           | The provider validates at runtime now, but config-schema autocomplete still does not know the Codex-specific shape. Consider adding provider-aware config schema generation in a separate schema project. |

## Real E2E Test Runbook

Run all commands from the repository root.

### 1. Align Node and install dependencies

```bash
source ~/.nvm/nvm.sh && nvm use
npm ci
```

If `better-sqlite3` reports an ABI mismatch after switching Node versions, run:

```bash
npm rebuild better-sqlite3
```

### 2. Run focused unit tests

```bash
npx vitest run test/providers/openai-codex-sdk.test.ts
```

### 3. Run TypeScript and docs formatting checks

```bash
npm run tsc
npm run format:check
```

### 4. Run real Codex evals with the local build

Use `--no-cache` so you are validating the current provider behavior and not old cached outputs.

#### Basic read-only code generation

```bash
npm run local -- eval -c examples/openai-codex-sdk/basic/promptfooconfig.yaml --env-file .env --no-cache -o /tmp/promptfoo-codex-basic.json
```

Inspect `/tmp/promptfoo-codex-basic.json` and verify:

- `results.results[0].success === true`
- `results.results[0].response.output` contains `def factorial`
- `results.results[0].response.tokenUsage` is present
- `results.results[0].response.error` is absent

#### Skill usage eval

```bash
CODEX_SKILLS_WORKING_DIR="$PWD/examples/openai-codex-sdk/skills/sample-project" \
CODEX_HOME_OVERRIDE="$PWD/examples/openai-codex-sdk/skills/sample-codex-home" \
npm run local -- eval -c examples/openai-codex-sdk/skills/promptfooconfig.yaml --env-file .env --no-cache -o /tmp/promptfoo-codex-skills.json
```

Inspect `/tmp/promptfoo-codex-skills.json` and verify:

- `results.results[0].success === true`
- `results.results[0].response.output` equals or contains `CERULEAN-FALCON-SKILL`
- `results.results[0].response.metadata.skillCalls[0].name === "token-skill"`

#### Skill tracing eval

```bash
CODEX_SKILLS_WORKING_DIR="$PWD/examples/openai-codex-sdk/skills/sample-project" \
CODEX_HOME_OVERRIDE="$PWD/examples/openai-codex-sdk/skills/sample-codex-home" \
npm run local -- eval -c examples/openai-codex-sdk/skills/promptfooconfig.tracing.yaml --env-file .env --no-cache -o /tmp/promptfoo-codex-skills-tracing.json
```

Verify the eval passes and that the exported result contains `skillCalls`. If an OTLP backend is listening on `127.0.0.1:4318`, inspect spans for `codex.command`, `promptfoo.skill.*`, and redacted command/message/reasoning attributes.

### 5. Run a thread-persistence sanity check

Create a temporary config that keeps one thread alive across tests rendered from the same template:

```yaml title="/tmp/promptfoo-codex-thread.yaml"
providers:
  - id: openai:codex-sdk
    config:
      model: gpt-5.2-codex
      persist_threads: true
      thread_pool_size: 1
      sandbox_mode: read-only
      skip_git_repo_check: true

prompts:
  - '{{request}}'

tests:
  - vars:
      request: 'Remember this marker: BLUE-OTTER-19. Reply with "stored".'
  - vars:
      request: 'What marker did I ask you to remember?'
    assert:
      - type: contains
        value: 'BLUE-OTTER-19'
```

Run it with:

```bash
npm run local -- eval -c /tmp/promptfoo-codex-thread.yaml --env-file .env --no-cache -o /tmp/promptfoo-codex-thread.json
```

If the second test cannot recover the marker, inspect whether `persist_threads` was disabled by `deep_tracing`, whether the prompt template changed, or whether the SDK/model reset context.

### 6. Run a sandbox sanity check

Create a disposable workspace and verify that `read-only` prevents file writes while `workspace-write` allows them:

```bash
mkdir -p /tmp/promptfoo-codex-sandbox
git -C /tmp/promptfoo-codex-sandbox init
```

```yaml title="/tmp/promptfoo-codex-readonly.yaml"
providers:
  - id: openai:codex-sdk
    config:
      working_dir: /tmp/promptfoo-codex-sandbox
      model: gpt-5.2-codex
      sandbox_mode: read-only
      approval_policy: never

prompts:
  - 'Try to create hello.txt in the working directory, then explain whether the write succeeded.'

tests:
  - assert:
      - type: icontains-any
        value:
          - 'read-only'
          - 'permission'
          - 'not allowed'
          - 'failed'
```

```bash
npm run local -- eval -c /tmp/promptfoo-codex-readonly.yaml --env-file .env --no-cache -o /tmp/promptfoo-codex-readonly.json
```

Then rerun with `sandbox_mode: workspace-write` and assert that `hello.txt` exists in `/tmp/promptfoo-codex-sandbox` after the eval if your test intentionally permits mutation.

## Review Checklist for Future Codex Provider Changes

- Update `src/providers/openai/codex-sdk.ts` and add success + negative-path tests in `test/providers/openai-codex-sdk.test.ts`.
- If you add new config fields, update the public docs and examples in `site/docs/providers/openai-codex-sdk.md` and `examples/openai-codex-sdk/`.
- Run real evals from the repository root with `npm run local -- eval ... --no-cache`.
- Review trace payloads for accidental secret leakage whenever you add new event attributes.
- Keep thread-persistence docs aligned with the actual cache-key strategy.
- If a change touches Codex models/pricing, update the model list, pricing table, and docs together.
