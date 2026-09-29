---
title: TypeSafe Jev Provider
sidebar_label: TypeSafe
description: Use TypeSafe's Jev System One model as a fast llm-rubric grader and classifier, with calibrated Noul, Score, and Choice probabilities instead of generated text.
keywords: [typesafe, jev, system one, llm-rubric, classifier, grader, promptfoo provider]
---

# TypeSafe

[TypeSafe](https://typesafe.ai)'s Jev is a "System One" model. It doesn't generate text. You send it a `state` and typed questions, and it returns calibrated probabilities ([API reference](https://docs.typesafe.ai/api)). There are three question types:

- **Noul**: a yes/no question. Returns the probability that the answer is yes.
- **Score**: a rubric of 2–10 ordered levels. Returns a probability-weighted position along the levels.
- **Choice**: one option from a set. Returns a probability for each option.

In promptfoo, Jev works as a grader for [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric/) and as a provider for the [`classifier`](/docs/configuration/expected-outputs/classifier/) assertion.

## Setup

1. Create an API key in the [TypeSafe console](https://console.typesafe.ai/keys).
2. Set the environment variable:

   ```bash
   export TYPESAFE_API_KEY=your_api_key_here
   ```

## Provider format

```text
typesafe:<model>
```

- `typesafe:jev-latest`: the latest stable Jev release
- `typesafe:jev-1.13.0`: a pinned version

An alias such as `jev-latest` moves when TypeSafe ships a new release. If you tune a `threshold` against one version, pin that version. The versioned model that answered is recorded in `metadata.typesafe.model`. See TypeSafe's [models page](https://docs.typesafe.ai/models) for current versions.

## Configuration

| Option         | Type          | Default                   | Description                                                                                                   |
| -------------- | ------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `apiKey`       | string        | `TYPESAFE_API_KEY`        | TypeSafe API key                                                                                              |
| `apiBaseUrl`   | string        | `https://api.typesafe.ai` | API base URL                                                                                                  |
| `threshold`    | number        | `0.5`                     | Minimum derived score (0–1) for `pass: true`                                                                  |
| `levels`       | array         | -                         | Ordered Score levels, low to high (2–10). When set, grading uses a Score question instead of a Noul question. |
| `instructions` | string/object | -                         | The question for `classifier`, and for direct `callApi` use outside `llm-rubric`                              |
| `labels`       | array/object  | -                         | Choice options for `classifier`: a list of labels, or a map of label to description                           |

Level descriptions, label descriptions, and `instructions` can be strings or JSON objects, as in the [TypeSafe API](https://docs.typesafe.ai/primitives/advanced).

## Grading with `llm-rubric`

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
        value: The reply apologizes and offers a replacement or refund
```

For each `llm-rubric` assertion, the provider sends one request. The graded output is the `state` and the rubric is a Noul question's `instructions`. The provider then returns the JSON that `llm-rubric` expects:

- `score` is the Noul probability.
- `pass` is `score >= threshold`.

State the rubric as a single yes/no statement or question. TypeSafe recommends [decomposing](https://docs.typesafe.ai/primitives) questions that weigh several independent factors, so split a compound rubric into several assertions.

### Score rubrics

To grade on a scale, set `levels`. The provider asks a Score question and scales the unrounded score to 0–1 over the level range. With three levels, a Jev score of 1.43 becomes 0.715.

```yaml
defaultTest:
  options:
    provider:
      id: typesafe:jev-latest
      config:
        threshold: 0.6
        levels:
          - Ignores the customer's problem
          - Acknowledges the problem but offers no fix
          - Acknowledges the problem and offers a concrete fix
```

The `llm-rubric` assertion's own `threshold` still applies to the returned score.

### Reasons are derived, not generated

Jev returns no rationale. The provider builds `reason` from the answer, for example:

```text
Derived from Jev Noul p=0.93 >= threshold 0.5
Derived from Jev Score 1.43 on levels 0–2 (normalized 0.715 >= threshold 0.5); nearest level 1: "Acknowledges the problem but offers no fix"
```

Jev's raw answer (the Noul probability, or the Score `score`, `legend`, `probabilities`, and `confidence`) is kept in the grading result's `metadata.typesafe`, along with the model version, threshold, and request id.

## Classification with `classifier`

`classifier` asks a Choice question about the output and compares the returned probability for `value` against `threshold`. Set `instructions` and `labels` in the provider config:

```yaml
assert:
  - type: classifier
    provider:
      id: typesafe:jev-latest
      config:
        instructions: Which team should handle this reply?
        labels:
          billing: Payments, invoicing, refunds
          technical: Bugs, outages, integrations
          sales: Pricing, upgrades, new accounts
    value: billing
    threshold: 0.5
```

`labels` can also be a plain list, such as `[billing, technical, sales]`. Set `threshold` explicitly: `classifier` defaults to 1.

## Caching

Responses are stored in promptfoo's cache. The cache key covers the model, the state, the full question schema, the ordered labels or levels, and the threshold. Changing, adding, or reordering labels therefore never reuses a cached probability. Use `--no-cache` to force fresh calls.

## Limitations

- Only `llm-rubric` and `classifier` are supported. Graders that expect other output formats, such as `factuality`, `model-graded-closedqa`, `g-eval`, or the RAG metrics, are not.
- In `llm-rubric` mode the provider reads the rubric and output directly and ignores `rubricPrompt`.
- Jev accepts text only. Image and audio outputs aren't sent.
- Each request allows 64k tokens in total and 32k for the state plus the longest question. See the [models page](https://docs.typesafe.ai/models) for rate limits.
- Grading requests don't retry `529 Overloaded` responses. `429` responses are retried with backoff.

## Data handling

TypeSafe states that it does not train on customer requests or responses. See TypeSafe's [legal documents](https://docs.typesafe.ai/legal) for retention and the data processing agreement.
