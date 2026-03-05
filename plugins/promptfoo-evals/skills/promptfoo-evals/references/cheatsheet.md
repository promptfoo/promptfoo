# Promptfoo Eval Cheatsheet

## Config structure

Field order: description, env, prompts, providers, defaultTest, scenarios, tests.

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Summarization quality' # 3-10 words

prompts:
  - file://prompts/main.txt # plain text with {{variables}}
  - file://prompts/chat.json # chat format [{role, content}]

providers:
  - openai:chat:gpt-4.1-mini # model ID shorthand
  - id: anthropic:messages:claude-sonnet-4-6
    label: claude # display name in results
    config:
      temperature: 0

defaultTest: # shared across all tests
  assert:
    - type: cost
      threshold: 0.01
    - type: latency
      threshold: 5000

tests:
  - file://tests/*.yaml # glob loads all test files
```

### Environment variables in configs

Use Nunjucks syntax with quotes — shell syntax (`$VAR`) does not work:

```yaml
# ✅ Correct
apiKey: '{{env.OPENAI_API_KEY}}'
baseUrl: '{{env.API_BASE_URL}}'

# ❌ Wrong
apiKey: $OPENAI_API_KEY
```

## Assertion types

### Deterministic (use first)

| Type                              | What it checks                                                        |
| --------------------------------- | --------------------------------------------------------------------- |
| `equals`                          | Exact match                                                           |
| `contains` / `icontains`          | Substring (case-sensitive / insensitive)                              |
| `contains-all` / `contains-any`   | All or any substrings                                                 |
| `icontains-all` / `icontains-any` | Case-insensitive variants                                             |
| `starts-with`                     | Prefix match                                                          |
| `regex`                           | Regex pattern                                                         |
| `is-json`                         | Valid JSON (optional JSON Schema in `value`)                          |
| `contains-json`                   | Output contains valid JSON                                            |
| `javascript`                      | `value: "output.length < 100"` (return bool or {pass, score, reason}) |
| `python`                          | Same as javascript but Python                                         |
| `cost`                            | `threshold: 0.01` (max cost in dollars)                               |
| `latency`                         | `threshold: 5000` (max ms)                                            |
| `word-count`                      | Validate word count                                                   |

All deterministic types support `not-` prefix: `not-contains`, `not-regex`, etc.

### Similarity

| Type          | What it checks                           |
| ------------- | ---------------------------------------- |
| `similar`     | Cosine similarity (set `threshold: 0.8`) |
| `levenshtein` | Edit distance                            |
| `rouge-n`     | ROUGE score (summarization)              |
| `bleu`        | BLEU score (translation)                 |

### Model-graded (use sparingly — costs money, non-deterministic)

| Type                    | When to use                                                   |
| ----------------------- | ------------------------------------------------------------- |
| `llm-rubric`            | Custom criteria: `value: "Is helpful, accurate, and concise"` |
| `factuality`            | Check factual accuracy against a reference                    |
| `answer-relevance`      | Is the answer relevant to the query                           |
| `context-faithfulness`  | Is the response grounded in provided context                  |
| `context-recall`        | Does the context contain needed info                          |
| `model-graded-closedqa` | Closed-domain QA scoring                                      |

### Tool/function call

| Type                            | What it checks                 |
| ------------------------------- | ------------------------------ |
| `is-valid-openai-tools-call`    | Valid OpenAI tools call format |
| `is-valid-openai-function-call` | Valid function call format     |

### Classification

| Type         | What it checks             |
| ------------ | -------------------------- |
| `moderation` | OpenAI moderation API      |
| `is-refusal` | Model refused to answer    |
| `classifier` | Custom text classification |

### Special

| Type          | What it does                   |
| ------------- | ------------------------------ |
| `select-best` | Compare all outputs, pick best |
| `human`       | Manual grading via web UI      |
| `webhook`     | External validation endpoint   |

### Assertion options

Assertions support these optional fields:

```yaml
assert:
  - type: icontains
    value: 'expected text'
    weight: 2 # relative importance for scoring (default: 1)
    threshold: 0.8 # assertion-specific (e.g. min score for graded; max for cost/latency)
    metric: 'relevance' # custom metric name for reporting
```

### Model-graded provider selection

Pin the grader model/provider explicitly for stable scoring:

```yaml
defaultTest:
  options:
    provider: openai:gpt-5-mini

tests:
  - description: 'Quality check'
    assert:
      - type: llm-rubric
        value: 'Accurate and concise'
        # Optional per-assertion override:
        # provider: anthropic:messages:claude-sonnet-4-6
```

## Provider patterns

### LLM providers

```yaml
# OpenAI
- openai:chat:gpt-4.1-2025-04-14
- openai:chat:gpt-4.1-mini
- openai:responses:gpt-4.1

# Anthropic
- anthropic:messages:claude-sonnet-4-6
- anthropic:messages:claude-haiku-4-5-20251001

# Google
- google:gemini-2.5-pro
- google:gemini-2.5-flash
- google:gemini-2.0-flash

# AWS Bedrock
- bedrock:anthropic.claude-sonnet-4-6
- bedrock:anthropic.claude-haiku-4-5-20251001-v1:0

# Other
- azure:chat:my-deployment
- groq:llama-3.3-70b-versatile
- ollama:chat:llama3.3
- mistral:mistral-large-latest
- togetherai:meta-llama/Llama-4-Scout-Instruct
```

### HTTP endpoint

```yaml
providers:
  - id: https
    label: my-api
    config:
      url: 'https://api.example.com/generate'
      method: POST
      headers:
        Content-Type: application/json
      body:
        prompt: '{{prompt}}'
      transformResponse: 'json.output'
```

### Python provider

```yaml
providers:
  - file://provider.py
```

```python
# provider.py
def call_api(prompt, options, context):
    # Call your system under test
    result = my_system(prompt)
    return {"output": result}
```

### JavaScript provider

```yaml
providers:
  - file://provider.js
```

```javascript
// provider.js
module.exports = {
  id: () => 'my-provider',
  callApi: async (prompt) => {
    const result = await mySystem(prompt);
    return { output: result };
  },
};
```

### Echo (testing assertions without an LLM)

```yaml
providers:
  - echo # Returns the prompt as output
```

### JSON mode (force structured output)

```yaml
providers:
  - id: openai:chat:gpt-4.1-mini
    config:
      temperature: 0
      response_format:
        type: json_object
```

## Test patterns

### Basic test

```yaml
- description: 'Returns correct answer'
  vars:
    question: 'What is 2+2?'
  assert:
    - type: contains
      value: '4'
```

### JSON output validation

```yaml
- description: 'Returns valid structured output'
  vars:
    input: 'Banana'
  assert:
    - type: is-json
      value:
        type: object
        required: [color]
        properties:
          color: { type: string }
    - type: javascript
      value: "JSON.parse(output).color.toLowerCase() === 'yellow'"
```

### Faithfulness check (include source in rubric)

```yaml
- description: 'Summary is grounded in source'
  vars:
    article: 'MIT researchers developed an aluminum-sulfur battery...'
  assert:
    - type: llm-rubric
      value: |
        The summary only states facts from this source:
        "{{article}}"
        It does not add, infer, or fabricate any claims.
```

### Transform output before assertions

When models wrap JSON in markdown fences or add extra text, use
`options.transform` to clean the output before assertions run:

````yaml
- description: 'Parses JSON from markdown output'
  vars:
    input: 'Give me a JSON object'
  options:
    transform: "output.replace(/```json\\n?|```/g, '').trim()"
  assert:
    - type: is-json
````

### Dataset-driven tests (scale)

```yaml
# CSV/JSONL/XLSX datasets
tests: file://tests.csv

# Script-generated tests
tests: file://generate_tests.py:create_tests
```

### Reusable assertion templates

```yaml
assertionTemplates:
  noHallucination: &noHallucination
    type: llm-rubric
    value: 'Response only contains information supported by the context'

tests:
  - description: 'Grounded response'
    vars: { query: 'What is our refund policy?' }
    assert:
      - *noHallucination
```

### Default test with shared constraints

```yaml
defaultTest:
  assert:
    - type: not-icontains
      value: 'As an AI'
    - type: cost
      threshold: 0.005
    - type: latency
      threshold: 3000
```

### Weighted scoring

```yaml
- description: 'Balanced quality check'
  vars:
    question: 'Explain quantum computing'
  assert:
    - type: llm-rubric
      value: 'Technically accurate'
      weight: 3
      metric: accuracy
    - type: llm-rubric
      value: 'Easy to understand for a beginner'
      weight: 1
      metric: clarity
    - type: javascript
      value: "output.split(' ').length <= 200"
      weight: 1
      metric: conciseness
```

## CLI commands

Always use `--no-cache` during development to avoid stale results.

```bash
npx promptfoo@latest validate -c path/to/promptfooconfig.yaml
npx promptfoo@latest eval -c path/to/promptfooconfig.yaml --no-cache
npx promptfoo@latest eval -c path/to/promptfooconfig.yaml -o output.json --no-cache
npx promptfoo@latest view
```

For CI/non-UI workflows, use `-o output.json` and check `success`, `score`, and
`error` fields.

Inside the promptfoo repo, use the local build:

```bash
npm run local -- validate -c path/to/promptfooconfig.yaml
npm run local -- eval -c path/to/promptfooconfig.yaml --no-cache --env-file .env
```

Do not run `npm run local -- view` unless explicitly asked.
