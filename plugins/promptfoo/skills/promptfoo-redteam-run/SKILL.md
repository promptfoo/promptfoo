---
name: promptfoo-redteam-run
description: >
  Run, rerun, inspect, and QA promptfoo redteam scans from generated redteam YAML
  or an existing redteam setup config. Use when executing `promptfoo redteam
  eval` or `promptfoo redteam run`, exporting results, triaging attack success
  rate, grader failures, target errors, filter/rerun commands, reports, or CI
  gates. Do not use for initial provider wiring or for choosing plugins and
  strategies before generation.
---

# Promptfoo Redteam Run

Execute redteam probes reproducibly, inspect the output artifact, and rerun only
the slice that needs attention. Prefer evaluating existing generated tests with
`redteam eval`; regenerate with `redteam run` only when config/test generation
must change.

Read `references/redteam-run-patterns.md` when you need command recipes, result
inspection snippets, or CI examples.

## Inputs

Infer these from the repo or user prompt:

- Generated scan file, usually `redteam.yaml`, or setup config if regeneration
  is requested.
- Target environment, secrets/env file, concurrency/rate limits, and whether
  cloud sharing is allowed.
- Grading mode: default remote grading, `redteam.provider`, `--grader`, or local
  deterministic QA provider.
- Desired output: JSON/YAML/HTML export, report, CI gate, failure triage, or
  rerun of a previous result.

If a target or generated tests are missing, use `promptfoo-provider-setup` or
`promptfoo-redteam-setup` first.

## Workflow

### 1. Choose run mode

- Use `redteam eval` when `redteam.yaml` already exists and you want stable
  apples-to-apples runs.
- Use `redteam run --force` only when the setup changed or the user wants fresh
  generated probes.
- Use a configured `redteam.provider` or `--grader` only when the scan needs a
  specific generator/grader or deterministic QA behavior.
- Disable cloud sharing by default for internal targets. `redteam eval` and
  `retry` accept `--no-share`; `redteam run` does not currently expose that
  flag, so export `PROMPTFOO_DISABLE_SHARING=true` for the whole invocation or
  split into `redteam generate` + `redteam eval --no-share`. Only re-enable
  sharing when the user explicitly asks for a cloud URL.

### 2. Preflight

From the promptfoo repo, align Node first:

```bash
source ~/.nvm/nvm.sh && nvm use
npm run local -- validate config -c path/to/redteam.yaml
npm run local -- validate target -c path/to/redteam.yaml
```

Check that generated tests include `assert`, `metadata.pluginId`,
`metadata.purpose` or `defaultTest.metadata.purpose`, and the real input vars.
For `file://` providers in a generated eval file, target providers resolve like
normal config file providers, so `file://./target.mjs` is relative to that config
file. `redteam.provider` is loaded during grading from the command working
directory, so use an absolute path or a repo-root-relative path when running from
the repo root.

If validation fails with `ENOENT` for `file://./target.mjs`, the generated YAML
was probably written to a different directory than the target. Regenerate beside
the source config, move the generated file next to the target, or change the
target id to an absolute/repo-root-relative `file://` path before rerunning.

### 3. Run and export

Evaluate generated tests:

```bash
npm run local -- redteam eval -c path/to/redteam.yaml -o /tmp/redteam-results.json --no-cache --no-share --no-progress-bar
```

Generate and evaluate in one command only when needed. `redteam run` has no
`--no-share` flag, so disable sharing via the environment variable:

```bash
PROMPTFOO_DISABLE_SHARING=true npm run local -- redteam run -c path/to/promptfooconfig.yaml --force --no-cache --no-progress-bar
```

For fragile targets, set `-j 1` and add `--delay` rather than allowing broad
concurrency.

### 4. Inspect results

Always inspect the exported artifact. Do not rely only on the exit code because
redteam failures may intentionally return a failing exit status.

Look for:

- `results.stats.successes`, `failures`, `errors`, and `tokenUsage`
- Failed or errored rows, including `response.output`, `error`, `gradingResult`,
  `metadata.pluginId`, `metadata.strategyId`, and target label
- `shareableUrl`; it should be `null` when `--no-share` is used
- Attack success rate: `failures / (successes + failures)`

Treat grader transport/parse failures separately from real target failures.
If `--filter-errors-only` returns zero rows, the source result likely had no
ERROR rows or the generated test indices changed since the source run.

### 5. Rerun narrowly

Use filters before rerunning expensive scans:

```bash
npm run local -- redteam eval -c path/to/redteam.yaml --filter-failing /tmp/redteam-results.json -o /tmp/redteam-failing-rerun.json --no-cache --no-share --no-progress-bar
npm run local -- redteam eval -c path/to/redteam.yaml --filter-errors-only /tmp/redteam-results.json -o /tmp/redteam-errors-rerun.json --no-cache --no-share --no-progress-bar
npm run local -- redteam eval -c path/to/redteam.yaml --filter-metadata pluginId=policy -o /tmp/redteam-policy.json --no-cache --no-share --no-progress-bar
```

For error-only reruns that should update the original evaluation in place, use
`promptfoo retry <evalId>` instead of creating another eval.

### 6. Report or gate

Use `redteam report` for interactive triage after results are written. It starts
or reuses the local Promptfoo UI, so ask before running it unless the user
explicitly requested the report UI:

```bash
npm run local -- redteam report
```

For CI, gate on explicit metrics from the JSON export. Keep thresholds tied to
the app's risk tolerance and track category-level changes with
`metadata.pluginId`.

## Common Mistakes

```bash
# WRONG: regenerates probes when you only wanted a comparable rerun
promptfoo redteam run

# BETTER: reuse generated tests
promptfoo redteam eval -c redteam.yaml -o results.json --no-cache --no-share
```

```bash
# WRONG: broad rerun after a flaky target error
promptfoo redteam eval -c redteam.yaml

# BETTER: rerun only target/grader errors from the prior result
promptfoo redteam eval -c redteam.yaml --filter-errors-only results.json -o errors-rerun.json --no-cache --no-share
```

## Output Contract

When done, state:

- Run mode used: existing generated tests or regenerate-and-run
- Config/result/report paths
- Data-sharing mode and grader/provider used
- Commands run and whether any returned nonzero due to redteam failures
- Success, failure, error counts and attack success rate
- Highest-priority failing plugins/strategies and recommended next rerun or fix
