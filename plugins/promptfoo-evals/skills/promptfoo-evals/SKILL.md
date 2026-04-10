---
name: promptfoo-evals
description: >
  Creates or updates promptfoo evaluation suites (promptfooconfig.yaml, prompts,
  tests, assertions, providers). Use when adding eval coverage, debugging
  regressions, or scaffolding a new eval matrix.
---

# Writing Promptfoo Evals

You produce maintainable promptfoo eval suites: clear test cases, deterministic
assertions where possible, model-graded only when needed.

See `references/cheatsheet.md` for the full assertion and provider reference.
For deep questions about promptfoo features, consult https://www.promptfoo.dev/llms-full.txt

## Inputs (infer from repo context if not provided)

- What is being evaluated (prompt, agent, endpoint, RAG pipeline)?
- What are the inputs and outputs (text, JSON, multi-turn chat, tool calls)?
- What does "good" look like (acceptance criteria, failure modes)?

If context is insufficient, scaffold with TODO markers and starter tests.

## Workflow

### 1. Find or create the eval suite

Search for existing configs: `promptfooconfig.yaml`, `promptfooconfig.yml`,
or any `promptfoo`/`evals` folder. Extend existing suites when possible.

For new suites, use this layout (unless the repo uses another convention):

```text
evals/<suite-name>/
  promptfooconfig.yaml
  prompts/
  tests/
```

Always add `# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json`
at the top of config files.

### 2. Write prompts

- Put prompts in `prompts/*.txt` (plain) or `prompts/*.json` (chat format)
- Reference via `file://prompts/main.txt`
- Use `{{variable}}` for test inputs
- If the app builds prompts dynamically, use a JS/Python provider instead of
  duplicating logic

### 3. Choose providers

Pick the simplest option that matches the real system:

| Scenario         | Provider pattern                                                      |
| ---------------- | --------------------------------------------------------------------- |
| Compare models   | `openai:chat:gpt-4.1-mini`, `anthropic:messages:claude-sonnet-4-6`    |
| Test an HTTP API | `id: https` with `config.url`, `config.body`, and `transformResponse` |
| Test local code  | `file://provider.py` or `file://provider.js`                          |
| Echo/passthrough | `echo` (returns prompt as-is, useful for testing assertions)          |

Keep provider count small: 1 for regression, 2 for comparison.

For JSON output, add `response_format` to the provider config:

```yaml
config:
  temperature: 0
  response_format:
    type: json_object
```

### 4. Write tests

Use file-based tests so they scale: `tests: file://tests/*.yaml`

For larger suites, use dataset-backed tests:

```yaml
tests: file://tests.csv
# or
tests: file://generate_tests.py:create_tests
```

Every test should have:

- `description` - short, specific
- `vars` - the inputs
- `assert` - validations (when automatable)

Cover: happy paths, edge cases, known regressions, safety/refusal checks,
output format compliance.

### 5. Add assertions

**Deterministic first** (fast, reliable, free):
`equals`, `contains`, `icontains`, `regex`, `is-json`, `contains-json`,
`starts-with`, `cost`, `latency`, `javascript`, `python`

**Model-graded sparingly** (slow, costs money, non-deterministic):
`llm-rubric`, `factuality`, `answer-relevance`, `context-faithfulness`

Assertions support optional `weight` (for scoring relative importance) and
`metric` (named score in reports). `threshold` is assertion-specific: for
graded assertions it is usually a minimum score (0-1), while for assertions
like `cost`/`latency` it is a maximum allowed value.

For model-graded assertions, explicitly set the grader provider so grading is
stable across runs:

```yaml
defaultTest:
  options:
    provider: openai:gpt-5-mini

tests:
  - description: 'Model-graded quality check'
    assert:
      - type: llm-rubric
        value: 'Accurate and concise'
        # Optional per-assertion override:
        # provider: anthropic:messages:claude-sonnet-4-6
```

**Hallucination / faithfulness pattern:**
When checking that output is grounded in source material, include the source in
the rubric so the grader can compare. Use `context-faithfulness` when you have
a context var, or inline the source in the `llm-rubric` value:

```yaml
assert:
  - type: llm-rubric
    value: |
      The summary only states facts from this source article:
      "{{article}}"
      It does not add, infer, or fabricate any claims.
```

**JSON output pattern:**

```yaml
assert:
  - type: is-json
    value: # optional JSON Schema
      type: object
      required: [name, score]
  - type: javascript
    value: 'JSON.parse(output).score >= 0.8'
```

**Transform pattern** (preprocess output before assertions):
When models wrap JSON in markdown fences or add preamble text, use
`options.transform` on the test to clean output before assertions run:

````yaml
options:
  transform: "output.replace(/```json\\n?|```/g, '').trim()"
````

Use `defaultTest` for assertions shared across all tests (cost limits, format
checks, etc.).

### 6. Validate and run

Before finishing, validate and provide run commands. Always use `--no-cache`
during development to avoid stale results. Only run eval if credentials are
available and safe to call.

```bash
npx promptfoo@latest validate -c <config>
npx promptfoo@latest eval -c <config> --no-cache
npx promptfoo@latest eval -c <config> -o output.json --no-cache
npx promptfoo@latest view
```

For CI/non-UI workflows, prefer the `-o output.json` command and inspect
`success`, `score`, and `error` fields.

If working in the promptfoo repo itself, prefer the local build:

```bash
npm run local -- validate -c <config>
npm run local -- eval -c <config> --no-cache --env-file .env
```

Do not run `npm run local -- view` unless explicitly asked.

## Common mistakes

```yaml
# ❌ WRONG — shell-style env vars don't work in YAML configs
apiKey: $OPENAI_API_KEY

# ✅ CORRECT — use Nunjucks syntax with quotes
apiKey: '{{env.OPENAI_API_KEY}}'
```

```yaml
# ❌ WRONG — rubric references "the article" but grader can't see it
- type: llm-rubric
  value: 'Only contains info from the original article'

# ✅ CORRECT — inline the source so the grader can compare
- type: llm-rubric
  value: |
    Only states facts from: "{{article}}"
```

## Output contract

When done, state:

- What the suite evaluates (1-3 bullets)
- Files created/modified (paths)
- How to run (copy-pastable commands)
- Required env vars
- TODOs left behind (only if unavoidable)
