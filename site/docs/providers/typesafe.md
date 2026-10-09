---
title: TypeSafe Jev Provider
sidebar_label: TypeSafe
description: Use TypeSafe's Jev model in Promptfoo as a fast llm-rubric grader and classifier, or test the Jev questions your application asks against labeled examples.
keywords: [typesafe, jev, system one, llm-rubric, classifier, grader, promptfoo provider]
---

# TypeSafe

[TypeSafe](https://typesafe.ai)'s Jev is a "System One" model. It doesn't generate text: you send it a `state` and typed questions, and it returns probabilities ([API reference](https://docs.typesafe.ai/api)). There are three question types:

- **Noul**: a yes/no question. Returns the probability that the answer is yes.
- **Score**: a rubric of ordered levels. Returns a probability-weighted position along the levels.
- **Choice**: one option from a set. Returns a probability for each option.

In Promptfoo, you can use Jev to:

- [Grade outputs](#grade-with-llm-rubric) with `llm-rubric`
- [Classify outputs](#classify-with-classifier) with the `classifier` assertion
- [Test your own Jev questions](#test-your-own-questions) as the provider under test

## Setup

1. Create an API key in the [TypeSafe console](https://console.typesafe.ai/keys).
2. Set the environment variable:

   ```bash
   export TYPESAFE_API_KEY=your_api_key_here
   ```

You can also set `apiKey` in the provider config.

## Provider format

```text
typesafe:<model>
```

- `typesafe:jev-latest`: the latest stable Jev release
- `typesafe:jev-1.13.0`: a pinned version

`jev-latest` is an alias that moves when TypeSafe ships a release, so scores can change without a config change. Pin a version when you tune a `threshold` against it. The version that answered is recorded in `metadata.typesafe.model`. See TypeSafe's [models page](https://docs.typesafe.ai/models) for current versions, pricing, and limits.

## Grade with `llm-rubric`

Set Jev as the grading provider with `defaultTest.options.provider`:

```yaml title="promptfooconfig.yaml"
prompts:
  - 'Reply to this customer message: {{message}}'

providers:
  - openai:gpt-6-luna

defaultTest:
  options:
    provider: typesafe:jev-latest

tests:
  - vars:
      message: My order arrived damaged.
    assert:
      - type: llm-rubric
        value: The reply apologizes to the customer
      - type: llm-rubric
        value: The reply offers a replacement or a refund
```

Each [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric/) assertion sends one request, with the output as the `state` and the rubric as a Noul question. The score is the probability that the rubric holds, and the assertion passes when the score is at least `threshold` (0.5 by default).

Write each rubric as a single yes/no statement. Jev [reads questions literally](https://docs.typesafe.ai/model-jaggedness/jev-1.13#literal-reading), and TypeSafe recommends [splitting a judgment](https://docs.typesafe.ai/primitives) that weighs several factors into separate questions, so use several assertions instead of one compound rubric.

### Score rubrics

To grade on a scale, set `levels`. The rubric becomes a Score question, and the result is scaled to 0–1 across the levels. With three levels, a Jev score of 1.43 becomes 0.715.

```yaml
assert:
  - type: llm-rubric
    value: How well does the reply resolve the customer's problem?
    provider:
      id: typesafe:jev-latest
      config:
        threshold: 0.75
        levels:
          - Ignores the customer's problem
          - Acknowledges the problem but offers no fix
          - Acknowledges the problem and offers a concrete fix
```

List levels from low to high. The API accepts up to 10.

### Thresholds

Set the pass cutoff with the provider's `config.threshold`, a number from 0 to 1. If the assertion also sets `threshold`, both must pass, so the effective cutoff is the higher of the two.

`not-llm-rubric` passes when the score is below the threshold, so raising `threshold` makes negated assertions easier to pass. Give them their own provider config if they need a different cutoff.

### Reasons and metadata

Jev returns no rationale. The assertion's `reason` states how the verdict was derived:

```text
Jev Noul probability 0.93 >= threshold 0.5
Jev Score 1.43 on levels 0–2 (0.715 normalized) >= threshold 0.5; nearest level: "Acknowledges the problem but offers no fix"
```

Jev's full answer, including a Score's `probabilities` and `confidence`, is in the grading result's `metadata.typesafe.answer`, next to the model version and request ID. The result's `renderedGradingPrompt` shows Promptfoo's standard grading prompt, which is not sent to Jev.

## Classify with `classifier`

[`classifier`](/docs/configuration/expected-outputs/classifier/) asks a Choice question about the output and compares the probability of `value` to the assertion's `threshold`. Set `instructions` and `labels` in the provider config:

```yaml
assert:
  - type: classifier
    value: billing
    threshold: 0.8
    provider:
      id: typesafe:jev-latest
      config:
        instructions: Which team should handle this reply?
        labels:
          billing: Payments, invoicing, refunds
          technical: Bugs, outages, integrations
          sales: Pricing, upgrades, new accounts
```

`labels` can also be a plain list, such as `[billing, technical, sales]`, with up to 255 options. `value` must match a label exactly. Always set the assertion's `threshold`: it defaults to 1, and the provider's `config.threshold` applies only to `llm-rubric`.

Choice probabilities are relative to the labels you list, so one label can score high even when none fits. Add a catch-all label such as `other` when that can happen. Label order has a small effect on the probabilities, and labels that look like integers, such as `1` and `2`, are always sent in ascending order.

## Test your own questions

If your application calls Jev, list it under `providers` with the `questions` you ask. Each prompt is sent as the `state`, and the output is Jev's answers keyed by question ID:

```yaml title="promptfooconfig.yaml"
prompts:
  - '{{ticket}}'

providers:
  - id: typesafe:jev-latest
    config:
      questions:
        team:
          type: choice
          instructions: Which team should handle this ticket?
          criteria:
            billing: Payments, invoicing, refunds
            technical: Bugs, outages, integrations
            sales: Pricing, upgrades, new accounts
        urgent:
          type: noul
          instructions: Does the customer need a response today?

tests:
  - vars:
      ticket: Help! Payouts have been failing for three days.
    assert:
      - type: javascript
        value: output.team.choice === 'billing'
      - type: javascript
        value: output.urgent.noul > 0.8
```

`questions` uses the [API's question format](https://docs.typesafe.ai/api#question-types) and is sent unchanged. All questions in a request are answered against the same state.

A prompt that renders to a JSON object or array is sent as structured state, so questions can refer to its fields by name:

```yaml
prompts:
  - '{"message": {{message | dump}}, "policy": {{policy | dump}}}'

providers:
  - id: typesafe:jev-latest
    config:
      questions:
        allowed:
          type: noul
          instructions: Does `policy` allow the refund requested in `message`?
```

## Configuration

| Option         | Used by      | Default                   | Description                                                                 |
| -------------- | ------------ | ------------------------- | --------------------------------------------------------------------------- |
| `apiKey`       | All          | `TYPESAFE_API_KEY`        | TypeSafe API key                                                            |
| `apiBaseUrl`   | All          | `https://api.typesafe.ai` | API base URL                                                                |
| `threshold`    | `llm-rubric` | `0.5`                     | Minimum score to pass, from 0 to 1                                          |
| `levels`       | `llm-rubric` | -                         | Two or more Score levels, low to high. Omit to ask a yes/no Noul question   |
| `instructions` | `classifier` | -                         | What to decide                                                              |
| `labels`       | `classifier` | -                         | The options: a list of labels, or a map of label to description             |
| `questions`    | Provider     | -                         | Questions to ask about each prompt, as a map of question ID to API question |

Rubrics, `levels`, `instructions`, and label descriptions can be strings, objects, or arrays, as in the [TypeSafe API](https://docs.typesafe.ai/primitives/advanced).

Responses are cached like those of other providers; use `--no-cache` to force fresh calls. Promptfoo backs off and retries `429 Too Many Requests` and `529 Overloaded` responses, honoring `Retry-After`.

When Jev is the provider under test, Promptfoo reports cost for `jev-1.13.0` at TypeSafe's [published price](https://docs.typesafe.ai/models) of $0.042 per million input tokens. Output tokens are free.

## Limitations

- As a grader, Jev supports only `llm-rubric` and `classifier`. Other model-graded assertions, such as `factuality`, `g-eval`, and the RAG metrics, send a text-generation prompt that Jev can't answer.
- `llm-rubric` reads the rubric and output directly and ignores `rubricPrompt`.
- Each assertion is a separate request. To ask several questions in one request, use [`questions`](#test-your-own-questions).
- Jev accepts text only: strings, JSON objects, and arrays. A request can hold 64k tokens, with 32k for the state plus the longest question.
- Jev 1.13 is unreliable at arithmetic, counting, and date comparisons, and its Score values aren't calibrated for interpolating between levels. See TypeSafe's [known limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13), and check grading quality on representative outputs before relying on a threshold.
- Output text that claims to satisfy the rubric can raise the score. Don't use Jev as the only grader for red team or other adversarial outputs.

## Data handling

Grading sends the output and rubric to TypeSafe, along with any `levels`. Classification sends the output, `instructions`, and `labels`. TypeSafe states that Jev is not trained on customer requests or responses and offers zero data retention to enterprise customers. Its public [legal documents](https://docs.typesafe.ai/legal) don't give a fixed retention period for other accounts, so confirm retention with TypeSafe before sending sensitive data.
