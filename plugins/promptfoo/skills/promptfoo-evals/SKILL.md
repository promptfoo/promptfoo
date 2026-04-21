---
name: promptfoo-evals
description: >
  Write, refine, run, and QA promptfoo eval configs for LLM applications:
  prompts, providers, vars, test cases, assertions, model-graded rubrics,
  transforms, datasets, output exports, filters, and CI gates. Use for
  non-redteam evaluation suites and regression tests. Do not use for initial
  provider connection work or for redteam plugin/strategy setup.
---

# Promptfoo Evals

Build a small eval that answers one product question clearly, run it with fresh
results, then inspect the exported artifact before expanding.

Read `references/eval-patterns.md` when you need concrete YAML patterns,
assertion examples, or CI snippets.
For deep promptfoo feature questions that are not covered here, consult
`https://www.promptfoo.dev/llms-full.txt`.

## Inputs

Infer these from the repo or user prompt:

- Behavior being evaluated and what "good" means.
- Target/provider already configured, or whether `promptfoo-provider-setup` is
  needed first.
- Prompt shape and variables.
- Test data source: inline cases, CSV/JSON, generated data, production examples,
  or hand-picked regressions.
- Assertion style: deterministic checks, structured output validation,
  JavaScript assertions, model-graded rubrics, or a mix.
- Output needs: JSON export, comparison, CI gate, or human triage.

If the provider does not work yet, switch to `promptfoo-provider-setup`. If the
task is adversarial security scanning, switch to `promptfoo-redteam-setup` or
`promptfoo-redteam-run`.

## Workflow

### 1. State the eval question

Search for existing configs first: `promptfooconfig.yaml`,
`promptfooconfig.yml`, or repo `evals`/`promptfoo` directories. Extend an
existing suite when possible.

Write one sentence for the behavior under test, then choose 3-10 starter cases.
Include both ordinary success cases and edge cases that have broken before.

For new suites, prefer this layout unless the repo already has a convention:

```text
evals/<suite-name>/
  promptfooconfig.yaml
  prompts/
  tests/
```

### 2. Choose assertions

Prefer deterministic assertions first:

- Exact or substring behavior: `equals`, `contains`, `icontains`, `regex`
- Structured output: `is-json`, `contains-json`, `javascript`
- Numeric or score-like outputs: `javascript` returning a boolean or score
- Semantic quality: `llm-rubric` with an explicit grader provider when possible

Use model-graded assertions sparingly for qualities that deterministic checks
cannot capture. Configure a local or explicit grader for reproducible QA.

### 3. Write the config

Include:

- `# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json`
- A short `description`
- Field order: `description`, `env`, `prompts`, `providers`, `defaultTest`,
  `scenarios`, `tests`
- `prompts` via `file://prompts/*.txt` or `file://prompts/*.json` when prompts
  are more than a one-line smoke test
- `tests: file://tests/*.yaml` for suites that will grow beyond a few cases
- `defaultTest` only for shared assertions/options
- `options.transform` when parsing JSON once makes assertions cleaner
- Stable metric names only when they help compare dashboards over time

Keep secrets as `{{env.VAR}}`; do not commit `.env` values.
When checking faithfulness or hallucination with `llm-rubric`, inline the source
material in the rubric via `{{variable}}` so the grader can actually compare.

### 4. Validate and run

From the promptfoo repo:

```bash
source ~/.nvm/nvm.sh && nvm use
npm run local -- validate config -c path/to/promptfooconfig.yaml
npm run local -- eval -c path/to/promptfooconfig.yaml -o /tmp/eval-results.json --no-cache --no-share
```

Outside the repo:

```bash
npx promptfoo@latest validate config -c path/to/promptfooconfig.yaml
npx promptfoo@latest eval -c path/to/promptfooconfig.yaml -o /tmp/eval-results.json --no-cache --no-share
```

Inspect the output JSON for `results.stats`, `response.output`, `score`,
`gradingResult.reason`, and `error`.

### 5. Iterate deliberately

- Add cases when a failure represents real expected behavior.
- Tighten assertions when false positives pass.
- Use `--filter-pattern`, `--filter-metadata`, or `--filter-failing` for focused
  reruns.
- Keep `--no-cache` while developing so you are not validating stale outputs.
- Use `--no-share` unless the user asks for a shareable URL.

## Common Mistakes

```yaml
# WRONG: vague rubric with no examples or grader control
- type: llm-rubric
  value: Is this good?

# BETTER: concrete success criteria
- type: llm-rubric
  value: >-
    The answer must cite the requested invoice id, state approved/denied, and
    avoid inventing fields not present in the tool result.
```

```yaml
# WRONG: unquoted JS expression that starts with [ or { is parsed as YAML flow
- type: javascript
  value: ['billing', 'technical'].includes(output.category)

# BETTER: quote any assertion value that begins with [, {, *, &, or !
- type: javascript
  value: "['billing', 'technical'].includes(output.category)"
```

```yaml
# WRONG: inline prompts that contain JSON-like braces are misread as file paths
prompts:
  - 'Classify: {{text}}. Return {"category": "..."} JSON.'

# BETTER: move non-trivial prompts (JSON examples, multi-line, quotes) to a file
prompts:
  - file://./prompts/classify.txt
```

```yaml
# WRONG: reparsing JSON in every assertion
assert:
  - type: javascript
    value: JSON.parse(output).status === 'approved'

# BETTER: parse once for the test
options:
  transform: JSON.parse(output)
assert:
  - type: javascript
    value: output.status === 'approved'
```

## Output Contract

When done, state:

- Eval question and target/provider used
- Files created or changed
- Assertion strategy and why
- Validation/eval commands run
- Result stats and any failures/errors
- Required environment variables
- Follow-up cases or assertions to add next
