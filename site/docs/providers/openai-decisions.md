---
title: OpenAI Decisions API
description: 'Evaluate classifications, predicates, and ordered scores with the OpenAI Decisions API. Compare distributions and assert on structured answers in Promptfoo.'
---

# OpenAI Decisions API

The `openai:decisions` provider calls OpenAI's standalone `/v1/decisions` endpoint. Each request evaluates a set of questions against the same input and returns structured answers with probabilities.

:::note

These examples use `gpt-6-luna`. See [OpenAI's Decisions guide](https://developers.openai.com/api/docs/guides/decisions) for current model availability.

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
| `questions`                                        | One or more predicate, choice, or score questions. Required when testing the provider directly.                                 |
| `threshold`                                        | Pass cutoff for `llm-rubric`, from 0 to 1. Defaults to `0.5`.                                                                   |
| `levels`                                           | Two to ten ordered score levels for `llm-rubric`, as strings or `{ label, description? }` objects. Omit to use a predicate.     |
| `instructions`, `labels`                           | Required for `classifier`: a question and a list of labels or a map of label to description.                                    |
| `safety_identifier`                                | Optional stable pseudonymous end-user identifier, at most 128 characters, or `null`.                                            |
| `apiKey`, `apiKeyEnvar`                            | Standard OpenAI credential overrides. Defaults to `OPENAI_API_KEY`.                                                             |
| `apiKeyRequired`                                   | Whether an OpenAI API key is required. Defaults to `true`.                                                                      |
| `useDefaultApiKey`                                 | Set to `false` to disable fallback to ambient `OPENAI_API_KEY`; explicitly configured keys are still honored.                   |
| `apiBaseUrl`, `apiHost`, `organization`, `headers` | Standard OpenAI endpoint and header overrides.                                                                                  |
| `maxRetries`                                       | HTTP retry limit. Set to `0` to disable retries.                                                                                |
| `cost`, `inputCost`, `outputCost`                  | Optional per-token prices. Set `cost` for a flat rate, or both `inputCost` and `outputCost`, to enable a cost estimate.         |

For gateway-only authentication through a custom `Authorization` header or URL userinfo, set both `apiKeyRequired: false` and `useDefaultApiKey: false`. This skips the OpenAI API-key check and disables ambient `OPENAI_API_KEY` fallback; explicitly configured keys are still honored.

The rendered prompt becomes the request's `input`. Text prompts are sent as strings. A JSON array must contain user messages whose content is a string or text/image parts. The provider accepts Responses-style `input_text` and `input_image` parts and normalizes Chat Completions-style `text` and `image_url` parts. Images must be inline base64 data URLs; hosted image URLs and file IDs are not supported. A request can include up to 128 images. Other roles, tool items, and audio inputs are rejected. Multiple messages form one input, so use separate test cases to evaluate independent inputs.

Promptfoo does not infer a default Decisions price. Cost estimates require the explicit per-token prices above. Custom input rates apply to all reported input tokens, including API-cached tokens; they are flat-rate estimates, not automatic Decisions billing. See [OpenAI's pricing and availability](https://developers.openai.com/api/docs/guides/decisions#pricing-and-availability) for current billing details. Matching results may be reused within an eval run; separate CLI invocations do not reuse provider results.

## Question types

The provider validates the question constraints below. Every question requires `type` and `instructions`. An optional `name` identifies its answer; supplied names must be unique within the request. Answers preserve question order and echo the name, or use `null` when omitted. Questions are evaluated independently.

| Type        | Additional configuration                                                                          | Answer                                                             |
| ----------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `predicate` | None; `instructions` states the proposition to evaluate.                                          | `probability` that the proposition holds, between 0 and 1.         |
| `choice`    | `choices`: 2–255 objects with a unique string or Boolean `value` and optional `description`.      | Selected `choice`, a full `probabilities` array, and `confidence`. |
| `score`     | `levels`: 2–10 objects ordered lowest to highest, each with a `label` and optional `description`. | Expected `score`, a full `probabilities` array, and `confidence`.  |

Choice values keep their original types: Boolean `true` and `false` are returned as Booleans. When a choice has no description, its value supplies the scoring text.

Score levels use zero-based indices. For three levels, the score ranges from `0` to `2` and can fall between levels because it is the probability-weighted mean of their indices. Each distribution entry includes the level's index and label. For direct score questions, levels must be objects, such as `{ label: Routine }`, even when no description is needed.

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

Predicate answers contain a probability without a confidence field. Choice and score answers include a probability distribution and a separate `confidence` field. Use labeled examples from your application to choose thresholds.

Promptfoo rejects choice and score distributions whose probabilities sum to more than one percentage point above or below 1. It also rejects scores whose normalized value differs by more than one percentage point from the probability-weighted value. Accepted values are unchanged. These provider validation tolerances allow rounding and do not guarantee the API's precision.

## Grade and classify outputs

Decisions can grade another provider's text or serialized output with `llm-rubric` and `classifier`. Image attachments in rubric prompts are rejected; use direct Decisions questions to evaluate images. Grading a transcript or description does not assess the underlying audio or video.

Set it as the grading provider to turn each rubric into a predicate about the output:

```yaml title="promptfooconfig.yaml"
prompts:
  - '{{reply}}'

providers:
  - echo

defaultTest:
  options:
    provider: openai:decisions:gpt-6-luna

tests:
  - vars:
      reply: I'm sorry your order arrived damaged. A replacement ships today at no cost to you.
    assert:
      - type: llm-rubric
        value: The reply apologizes to the customer
```

The predicate probability is the assertion score. Set the provider's `config.threshold` to change its pass cutoff from `0.5`. An assertion-level `threshold` must also pass when supplied. `not-llm-rubric` passes below the cutoff.

For an ordered rubric, set `levels` on the grading provider:

```yaml
assert:
  - type: llm-rubric
    value: How well does the reply resolve the customer's problem?
    provider:
      id: openai:decisions:gpt-6-luna
      config:
        threshold: 0.75
        levels:
          - Ignores the customer's problem
          - Acknowledges the problem but offers no fix
          - Acknowledges the problem and offers a concrete fix
```

List 2–10 levels from low to high. The expected score is divided by `levels.length - 1` to produce a grading score from 0 to 1. For example, `1.5` across three levels becomes `0.75`.

For classification, set a question in `instructions` and options in `labels`:

```yaml
assert:
  - type: classifier
    value: resolution
    threshold: 0.8
    provider:
      id: openai:decisions:gpt-6-luna
      config:
        instructions: What is this support reply doing?
        labels:
          resolution: Resolves the issue or offers a concrete fix
          deflection: Redirects the customer without helping
          question: Asks the customer for more information
```

`labels` can also be a list such as `[resolution, deflection, question]`. The assertion checks the probability of its `value`, which must match a label exactly. Set the assertion's `threshold` explicitly: it defaults to `1`, and the provider's `config.threshold` applies only to `llm-rubric`.

Assertions are graded independently. A refusal or malformed answer fails grading, including negated assertions. Decisions returns scores rather than a generated rationale, so the grading reason describes how Promptfoo derived the verdict. `llm-rubric` reads the rubric and output directly; custom `rubricPrompt` text is not sent to the API. Other model-graded assertions that require text generation are not supported.

The [example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-decisions) includes `promptfooconfig.grading.yaml` with fixed support replies for grading and classification. Tune thresholds on representative outputs before relying on them.

For a runnable example covering all three question types, use:

```sh
npx promptfoo@latest init --example openai-decisions
cd openai-decisions
npx promptfoo@latest eval --no-cache -o results.json
```
