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

In Promptfoo, Jev works as a grader for [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric/) and as a provider for the [`classifier`](/docs/configuration/expected-outputs/classifier/) assertion.

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

An alias such as `jev-latest` moves when TypeSafe ships a new release. If you tune a `threshold` against one version, pin that version. For `llm-rubric`, the versioned model that answered is recorded in `metadata.typesafe.model`. See TypeSafe's [models page](https://docs.typesafe.ai/models) for current versions and pricing.

## Configuration

| Option           | Type                | Default                   | Description                                                                                                   |
| ---------------- | ------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `apiKey`         | string              | `TYPESAFE_API_KEY`        | TypeSafe API key                                                                                              |
| `apiBaseUrl`     | string              | `https://api.typesafe.ai` | API base URL                                                                                                  |
| `cacheNamespace` | string              | -                         | Nonempty, nonsecret account-specific name that enables caching; omit to disable caching                       |
| `threshold`      | number              | `0.5`                     | Minimum derived score (0–1) for `llm-rubric` to pass; does not apply to `classifier`                          |
| `levels`         | array               | -                         | Ordered Score levels, low to high (2–10). When set, grading uses a Score question instead of a Noul question. |
| `instructions`   | string/object/array | -                         | The question for `classifier`, and for direct `callApi` use outside `llm-rubric`                              |
| `labels`         | array/object        | -                         | 2–255 Choice options for `classifier`: a list of unique, nonempty labels, or a map of label to description    |
| `maxRetries`     | integer             | `4`                       | Additional attempts for transient failures, including `429` and `529`; set to `0` to disable retries          |

Level descriptions, label descriptions, and `instructions` can be strings, JSON objects, or arrays, as in the [TypeSafe API](https://docs.typesafe.ai/primitives/advanced). Label descriptions can also be `null` when the label needs no extra detail. Label names must contain non-whitespace characters.

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

For `llm-rubric`, set the cutoff with the provider's `config.threshold`; an assertion threshold is usually unnecessary.

:::note

If you also set the `llm-rubric` assertion's own `threshold`, both thresholds must pass: the effective cutoff is the higher of the two. For example, an assertion threshold of `0.3` still requires a score of `0.5` with the provider's default threshold. `not-llm-rubric` inverts this combined pass/fail result.

:::

### Reasons are derived, not generated

Jev returns no rationale. The provider builds `reason` from the answer, for example:

```text
Derived from Jev Noul p=0.93 >= threshold 0.5
Derived from Jev Score 1.43 on levels 0–2 (normalized 0.715 >= threshold 0.5); nearest level 1: "Acknowledges the problem but offers no fix"
```

For `llm-rubric`, Jev's raw answer (the Noul probability, or the Score `score`, `legend`, `probabilities`, and `confidence`) is kept in the grading result's `metadata.typesafe`, along with the model version, threshold, and request id.

For model `jev-1.13.0`, `metadata.typesafe.estimatedCost` records the estimated USD cost at TypeSafe's [published price](https://docs.typesafe.ai/models) of $0.042 per million input tokens; output tokens are free. Cached responses have zero cost. Unknown model versions or missing input-token usage omit the estimate. This metadata estimate is informational and does not increase the eval's aggregate cost.

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

`labels` can also be a plain list, such as `[billing, technical, sales]`. Set the assertion's `threshold` explicitly: `classifier` defaults to 1 and ignores the provider's `config.threshold`. The assertion reports the selected label's probability as its score; it does not expose the full distribution, `metadata.typesafe`, or token usage.

Choice labels become JSON object keys. JavaScript serializes integer-index keys in ascending numeric order, so `['2', '1']` is sent in the same order as `['1', '2']`. Use descriptive labels such as `option-2` and `option-1` when the configured order matters. Score levels retain their array order.

## Caching

Caching is disabled unless you set `config.cacheNamespace` to a nonempty, nonsecret name for your TypeSafe account:

```yaml
provider:
  id: typesafe:jev-latest
  config:
    cacheNamespace: support-team-typesafe
```

Use a different namespace for each account. Never put an API key or another secret in the namespace. Providers using the same namespace, API base URL, and serialized request intentionally share cached responses; the namespace does not verify credentials.

The cache key includes the namespace, API base URL, and exact serialized request, including model, state, questions, and their serialized order. Thresholds are applied locally, so changing a threshold can reuse the same response. Invalid responses are evicted. Use `--no-cache` to force fresh calls even when a namespace is set.

## Limitations

- Only `llm-rubric` and `classifier` are supported. Graders that expect other output formats, such as `factuality`, `model-graded-closedqa`, `g-eval`, or the RAG metrics, are not.
- In `llm-rubric` mode the provider reads the rubric and output directly and ignores `rubricPrompt`.
- Jev accepts text only. Image and audio outputs aren't sent.
- Each request allows 64k tokens in total and 32k for the state plus the longest question. See the [models page](https://docs.typesafe.ai/models) for rate limits.
- Jev 1.13 has documented limitations with arithmetic, counting, date comparisons, and adversarial content in the state. Use code for exact calculations and test grading quality on representative outputs. See TypeSafe's [known model limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13).

Transient failures, including `429 Too Many Requests` and `529 Overloaded`, are retried with backoff, honoring `Retry-After` when provided. Set `maxRetries` to bound retries or `0` to disable them. Cancelling an eval cancels active rubric and classifier requests and pending retry delays.

## Data handling

Grading sends the output, rubric, and any configured Score levels to TypeSafe; classification sends the output, instructions, and labels. TypeSafe states that it does not train on customer requests or responses and offers zero data retention for enterprise customers. See its [legal documents](https://docs.typesafe.ai/legal).

The [privacy policy](https://typesafe.ai/legal/privacy-policy) describes collecting input and retaining personal data as needed for its stated purposes; it does not give a fixed default retention period for API content. Confirm request/response logging and retention for your account with TypeSafe before sending sensitive data. No-training does not imply zero retention.
