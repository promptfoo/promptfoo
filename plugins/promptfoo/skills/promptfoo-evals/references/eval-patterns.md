# Eval Patterns

## Config Structure

Use this order so configs stay easy to scan:

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Invoice approval regression

prompts:
  - file://prompts/main.txt

providers:
  - id: file://./provider.mjs
    label: invoice-agent

defaultTest:
  assert:
    - type: latency
      threshold: 5000

tests:
  - file://tests/*.yaml
```

Use quoted Nunjucks env references:

```yaml
apiKey: '{{env.OPENAI_API_KEY}}'
baseUrl: '{{env.API_BASE_URL}}'
```

## Minimal Local Provider Eval

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Local provider smoke eval

prompts:
  - 'Answer {{question}} with the trace id {{trace_id}}.'

providers:
  - id: file://./provider.mjs
    label: local-smoke-provider

tests:
  - vars:
      question: Say PONG
      trace_id: eval-123
    assert:
      - type: contains
        value: PONG
      - type: regex
        value: trace id eval-123
```

Python local providers use the same `call_api(prompt, options, context)` shape:

```yaml
providers:
  - id: file://./provider.py
    label: local-python-smoke
    config:
      workers: 1
```

If a Python provider imports nearby app modules, anchor `sys.path` to
`Path(__file__).resolve().parent` before those imports.
Provider `config` reaches JS wrappers as constructor `options.config` and Python
wrappers as the `options` argument to `call_api`.

## Known Provider Examples

Use these when the provider is already known and does not need discovery:

```yaml
providers:
  - openai:chat:gpt-4.1-mini
  - anthropic:messages:claude-sonnet-4-6
  - echo
```

For HTTP APIs, local app code, auth, custom parsing, or redteam targets, switch
to `promptfoo-provider-setup` before expanding eval assertions.

## File-Based Tests

```text
evals/invoice-approval/
  promptfooconfig.yaml
  prompts/main.txt
  tests/happy-path.yaml
  tests/regressions.yaml
```

```yaml
prompts:
  - file://prompts/main.txt

tests:
  - file://tests/*.yaml
```

## Dataset-Backed Tests

Use datasets when cases are tabular or generated from source data.

```yaml
tests: file://tests.csv
```

Script-generated tests can keep large suites deterministic:

```yaml
tests: file://generate_tests.py:create_tests
```

Return test cases with `description`, `vars`, and `assert` so generated cases
look like hand-authored cases in Promptfoo results.

## Assertion Scoring Options

Use `weight` to make important checks count more, `metric` to name report
series, and `threshold` according to the assertion type:

```yaml
assert:
  - type: icontains
    value: approved
    weight: 2
    metric: decision_accuracy
  - type: llm-rubric
    value: The answer is accurate and cites the relevant source.
    threshold: 0.8
  - type: latency
    threshold: 5000
```

For model-graded assertions, `threshold` is usually a minimum score from 0 to 1.
For `cost` and `latency`, it is a maximum allowed value.

## Structured JSON Eval

```yaml
tests:
  - vars:
      invoice_id: inv-123
    options:
      transform: JSON.parse(output)
    assert:
      - type: is-json
      - type: javascript
        value: output.invoice_id === 'inv-123' && output.status === 'approved'
      - type: contains-any
        transform: output.reasons
        value:
          - policy-match
          - low-risk
```

If the model wraps JSON in markdown fences, clean it before assertions:

````yaml
options:
  transform: "output.replace(/```json\\n?|```/g, '').trim()"
````

## Local Model-Graded Rubric

```yaml
defaultTest:
  options:
    provider: file://./grader.mjs

tests:
  - vars:
      question: Summarize invoice inv-123.
    assert:
      - type: llm-rubric
        value: >-
          The response must mention invoice inv-123, state that it is approved,
          and avoid claiming payment was already sent.
```

The grader provider returns JSON with `pass`, `score`, and `reason`.

```js
export default class DeterministicEvalGrader {
  id() {
    return 'deterministic-eval-grader';
  }

  async callApi(prompt) {
    const text = String(prompt);
    const pass = text.includes('inv-123') && text.includes('approved');
    return {
      output: JSON.stringify({
        pass,
        score: pass ? 1 : 0,
        reason: pass ? 'Criteria satisfied.' : 'Missing invoice approval details.',
      }),
    };
  }
}
```

## Faithfulness Rubric

```yaml
assert:
  - type: llm-rubric
    value: |
      The summary only states facts from this source:
      "{{article}}"
      It does not add, infer, or fabricate any claims.
```

Use `context-faithfulness` when the source is already available as context;
otherwise inline the source in the rubric as shown.

## Focused Reruns

```bash
npm run local -- eval -c promptfooconfig.yaml --filter-pattern invoice -o /tmp/invoice.json --no-cache --no-share
npm run local -- eval -c promptfooconfig.yaml --filter-metadata area=billing -o /tmp/billing.json --no-cache --no-share
npm run local -- eval -c promptfooconfig.yaml --filter-failing /tmp/eval-results.json -o /tmp/failing.json --no-cache --no-share
```

## CI Gate

```bash
PROMPTFOO_FAILED_TEST_EXIT_CODE=0 npm run local -- eval -c promptfooconfig.yaml -o eval-results.json --no-cache --no-share
node -e "const s=require('./eval-results.json').results.stats; if (s.errors || s.failures) process.exit(1)"
```

Use the environment override only when the follow-up gate owns the failure
decision.
