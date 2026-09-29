---
title: OpenAI Decisions API
description: 'Evaluate classifications, predicates, and ordered scores with the OpenAI Decisions API. Compare distributions and assert on structured answers in Promptfoo.'
---

# OpenAI Decisions API

The `openai:decisions` provider calls OpenAI's standalone `/v1/decisions` endpoint. Each request evaluates a set of questions against the same input and returns structured answers with probabilities.

:::note

The Decisions API is in alpha and requires an enabled OpenAI project. Model availability and the API contract may change.

:::

## Quickstart

Set `OPENAI_API_KEY`, then save this configuration:

```yaml title="promptfooconfig.yaml"
prompts:
  - '{{ticket}}'

providers:
  - id: openai:decisions:gpt-6-luna
    config:
      questions:
        - type: choice
          name: category
          instructions: Classify the support ticket.
          choices:
            - value: billing
            - value: technical
              description: Software errors and service outages
        - type: predicate
          name: duplicate_charge
          instructions: The customer reports being charged more than once for the same purchase.

tests:
  - vars:
      ticket: I was charged twice for the same subscription renewal.
    assert:
      - type: javascript
        value: JSON.parse(output).answers[0].choice === 'billing'
      - type: javascript
        value: JSON.parse(output).answers[1].probability > 0.8
```

Run the eval and export its results:

```sh
npx promptfoo@latest eval --no-cache -o results.json
```

## Configuration

| Option                                             | Description                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `model`                                            | Required when using bare `openai:decisions`. A model in `openai:decisions:<model>` takes precedence. There is no default model. |
| `questions`                                        | Required array of 1–64 predicate, choice, or score questions.                                                                   |
| `safety_identifier`                                | Optional stable pseudonymous end-user identifier, at most 64 characters, or `null`.                                             |
| `apiKey`, `apiKeyEnvar`                            | Standard OpenAI credential overrides. Defaults to `OPENAI_API_KEY`.                                                             |
| `apiBaseUrl`, `apiHost`, `organization`, `headers` | Standard OpenAI endpoint and header overrides.                                                                                  |
| `maxRetries`                                       | HTTP retry limit. Set to `0` to disable retries.                                                                                |
| `cost`, `inputCost`, `outputCost`                  | Optional per-token prices. Set `cost` for a flat rate, or both `inputCost` and `outputCost`, to enable a cost estimate.         |

The rendered prompt becomes the request's `input`. Text prompts are sent as strings. A JSON array must contain user messages whose content is a string or text/image parts. The provider accepts Responses-style `input_text` and `input_image` parts and normalizes Chat Completions-style `text` and `image_url` parts. Other roles, tool items, and audio inputs are rejected. Multiple messages form one input, so use separate test cases to evaluate independent inputs.

Promptfoo does not infer a default Decisions price. Cost estimates require the explicit per-token prices above. Cached results are scoped to the current provider instance and its credential identity: repeated requests within one eval can use the cache, but separate runs do not reuse those results.

## Question types

Every question requires `type` and `instructions`. An optional `name` identifies its answer; supplied names must be unique within the request. Answers preserve question order and echo the name, or use `null` when omitted. Questions are evaluated independently.

| Type        | Additional configuration                                                                          | Answer                                                             |
| ----------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `predicate` | None; `instructions` states the proposition to evaluate.                                          | `probability` that the proposition holds, between 0 and 1.         |
| `choice`    | `choices`: 2–255 objects with a unique string or Boolean `value` and optional `description`.      | Selected `choice`, a full `probabilities` array, and `confidence`. |
| `score`     | `levels`: 2–10 objects ordered lowest to highest, each with a `label` and optional `description`. | Expected `score`, a full `probabilities` array, and `confidence`.  |

Choice values keep their original types: Boolean `true` and `false` are returned as Booleans. When a choice has no description, its value supplies the scoring text.

Score levels use zero-based indices. For three levels, the score ranges from `0` to `2` and can fall between levels because it is the probability-weighted mean of their indices. Each distribution entry includes the level's index and label. Levels must be objects, such as `{ label: Routine }`, even when no description is needed.

For example, add an ordered score question:

```yaml
questions:
  - type: score
    name: urgency
    instructions: How urgently does this ticket need a response?
    levels:
      - label: Routine
        description: A question that can wait until the next business day
      - label: Degraded
        description: An error affecting some functionality
      - label: Blocked
        description: The customer cannot use the service
```

## Results and assertions

Provider output is a JSON string containing `{ "answers": [...] }`. Read it with `JSON.parse(output).answers` in JavaScript assertions. The provider also records the resolved model in `response.metadata.model` and reports token usage separately from the scored output.

A question can return `{ "name": "category", "type": "refusal" }`. This is a successful API answer with no score or probability; other questions can still receive answers. Handle refusal explicitly when an assertion requires a particular answer type:

```yaml
assert:
  - type: javascript
    value: |
      const answer = JSON.parse(output).answers[0];
      return answer.type === 'choice' && answer.choice === 'billing';
```

Probabilities describe the answer conditional on no refusal. Choice and score `confidence` measures distribution concentration, not a calibrated probability that the answer is correct. Predicate answers contain a probability without a confidence field.

For a runnable example covering all three question types, use:

```sh
npx promptfoo@latest init --example openai-decisions
cd openai-decisions
npx promptfoo@latest eval --no-cache -o results.json
```
