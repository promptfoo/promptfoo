---
title: Nace Drex Provider
sidebar_label: Nace
description: Use nace.ai's Drex decision models in Promptfoo to grade with llm-rubric, classify outputs, test your own Drex questions, and send images to Drex Max.
keywords:
  [nace, drex, drex max, system one, llm-rubric, classifier, grader, images, promptfoo provider]
---

# Nace

[Nace](https://nace.ai)'s Drex models are decision models, like TypeSafe's Jev. They don't generate text: you send a `state` and typed questions, and they return probabilities ([API reference](https://console.nace.ai/docs/drex/api-reference/systemone)). There are three question types:

- **Noul**: a yes/no question. Returns the probability that the answer is yes.
- **Score**: a rubric of ordered levels. Returns a probability-weighted position along the levels.
- **Choice**: one option from a set. Returns a probability for each option.

Drex Max, the most accurate Drex model, also reads [images](#images).

In Promptfoo, you can use Drex to:

- [Grade outputs](#grade-with-llm-rubric) with `llm-rubric`
- [Classify outputs](#classify-with-classifier) with the `classifier` assertion
- [Test your own Drex questions](#test-your-own-questions) as the provider under test
- [Ask about images](#images) with Drex Max

## Setup

1. Create an API key on the [API Keys page](https://console.nace.ai/dashboard/api-keys) of the Nace console (see the [authentication guide](https://console.nace.ai/docs/drex/guides/authentication)).
2. Set the environment variable:

   ```bash
   export NACE_API_KEY=your_api_key_here
   ```

You can also set `apiKey` in the provider config.

## Provider format

```text
nace:<model>
```

- `nace:drex-max`: Drex Max, the most accurate Drex model. It reads images, which Drex 2.0 does not. `nace` on its own means `nace:drex-max`.
- `nace:drex-max-v1.1`: Drex Max v1.1, a separate served model at the same price, with images and its own token limits.
- `nace:drex-v2.0`: Drex 2.0, the text-only model.
- `nace:drex-latest`: an alias that points to `drex-v2.0`, not to Drex Max.

`drex-max`, `drex-max-v1.1`, and `drex-v2.0` are pinned ids. `drex-latest` moves to a newer version on a date Nace announces in advance, so pin a version when you tune a `threshold` against it. The version that answered is recorded in `metadata.nace.model`. See Nace's [models page](https://console.nace.ai/docs/drex/reference/models) for current versions, prices, and limits.

## Grade with `llm-rubric`

Set Drex as the grading provider with `defaultTest.options.provider`:

```yaml title="promptfooconfig.yaml"
prompts:
  - 'Reply to this customer message: {{message}}'

providers:
  - openai:gpt-6-luna

defaultTest:
  options:
    provider: nace:drex-max

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

Write each rubric as a single yes/no statement. Nace's [questions guide](https://console.nace.ai/docs/drex/guides/questions) recommends starting from the decision your code makes next, so use several assertions instead of one compound rubric.

### Score rubrics

To grade on a scale, set `levels`. The rubric becomes a Score question, and the result is scaled to 0–1 across the levels. With three levels, a Drex score of 1.43 becomes 0.715.

```yaml
assert:
  - type: llm-rubric
    value: How well does the reply resolve the customer's problem?
    provider:
      id: nace:drex-max
      config:
        threshold: 0.75
        levels:
          - Ignores the customer's problem
          - Acknowledges the problem but offers no fix
          - Acknowledges the problem and offers a concrete fix
```

List levels from low to high, as strings. The API accepts up to 255.

### Thresholds

Set the pass cutoff with the provider's `config.threshold`, a number from 0 to 1. If the assertion also sets `threshold`, both must pass, so the effective cutoff is the higher of the two.

`not-llm-rubric` passes when the score is below the threshold, so raising `threshold` makes negated assertions easier to pass. Give them their own provider config if they need a different cutoff.

### Reasons and metadata

Drex returns no rationale. The assertion's `reason` states how the verdict was derived:

```text
Drex Noul probability 0.93 >= threshold 0.5
Drex Score 1.43 on levels 0–2 (0.715 normalized) >= threshold 0.5; nearest level: "Acknowledges the problem but offers no fix"
```

Drex's full answer, including a Score's `legend`, `probabilities`, and `confidence`, is in the grading result's `metadata.nace.answer`, next to the model version and request ID. The result's `renderedGradingPrompt` shows Promptfoo's standard grading prompt, which is not sent to Drex.

## Classify with `classifier`

[`classifier`](/docs/configuration/expected-outputs/classifier/) asks a Choice question about the output and compares the probability of `value` to the assertion's `threshold`. Set `instructions` and `labels` in the provider config:

```yaml
assert:
  - type: classifier
    value: billing
    threshold: 0.8
    provider:
      id: nace:drex-max
      config:
        instructions: Which team should handle this reply?
        labels:
          billing: Payments, invoicing, refunds
          technical: Bugs, outages, integrations
          sales: Pricing, upgrades, new accounts
```

`labels` can also be a plain list, such as `[billing, technical, sales]`, with up to 255 options. Descriptions must be strings. `value` must match a label exactly. Always set the assertion's `threshold`: it defaults to 1, and the provider's `config.threshold` applies only to `llm-rubric`.

Choice probabilities are relative to the labels you list, so one label can score high even when none fits. Add a catch-all label such as `other` when that can happen.

## Test your own questions

If your application calls Drex, list it under `providers` with the `questions` you ask. Each prompt is sent as the `state`, and the output is Drex's answers keyed by question ID:

```yaml title="promptfooconfig.yaml"
prompts:
  - '{{ticket}}'

providers:
  - id: nace:drex-max
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

`questions` uses the [API's question format](https://console.nace.ai/docs/drex/guides/questions) and is sent unchanged. All questions in a request are answered against the same state. Drex Max answers up to 512 questions per request.

A prompt that renders to a JSON object or array is sent as structured state, so questions can refer to its fields by name:

```yaml
prompts:
  - '{"message": {{message | dump}}, "policy": {{policy | dump}}}'

providers:
  - id: nace:drex-max
    config:
      questions:
        allowed:
          type: noul
          instructions: Does `policy` allow the refund requested in `message`?
```

## Images

Drex Max reads up to 8 PNG, JPEG, or WebP images per request. List them in the provider's `images`. Each entry is an image file path (relative to the config file), a data URL, or base64. Entries are templates rendered with the test vars, so a `file://` image var works (except in `classifier`, which has no test vars; see below). Refer to the images as "Image 1", "Image 2", and so on in the state or the instructions; those words stay plain text, and Drex matches them to the images by list order.

```yaml title="promptfooconfig.yaml"
prompts:
  - 'Image 1 is the photo a customer attached to a damage claim.'

providers:
  - id: nace:drex-max
    config:
      images:
        - '{{photo}}'
      questions:
        damaged:
          type: noul
          instructions: Does Image 1 show a damaged item?
        severity:
          type: score
          instructions: How severe is the damage in Image 1?
          criteria: [None, Cosmetic, Needs repair, Total loss]

tests:
  - vars:
      photo: file://claims/cracked-lamp.jpg
    assert:
      - type: javascript
        value: output.damaged.noul > 0.8
```

The same `images` config works when Drex Max grades with `llm-rubric` or `classifier`, so it can grade an output against a reference image. A `classifier` assertion has no access to the test's vars, so its `images` must be file paths, data URLs, or base64 rather than `{{var}}` templates; `llm-rubric` renders them with the test vars. Images in the output of the provider under test are not sent to Drex.

`drex-max` and `drex-max-v1.1` accept `images`; the text-only `drex-v2.0` does not. Drex Max resizes each image to at most 1,638,400 pixels, inline images count toward the 4 MiB body limit, and image tokens are billed as input tokens. See Nace's [Drex Max guide](https://console.nace.ai/docs/drex/guides/drex-max) for the image limits.

## Configuration

| Option         | Used by      | Default                   | Description                                                                            |
| -------------- | ------------ | ------------------------- | -------------------------------------------------------------------------------------- |
| `apiKey`       | All          | `NACE_API_KEY`            | Nace API key                                                                           |
| `apiBaseUrl`   | All          | `https://console.nace.ai` | API base URL                                                                           |
| `threshold`    | `llm-rubric` | `0.5`                     | Minimum score to pass, from 0 to 1                                                     |
| `levels`       | `llm-rubric` | -                         | Two or more Score levels, low to high. Omit to ask a yes/no Noul question              |
| `instructions` | `classifier` | -                         | What to decide                                                                         |
| `labels`       | `classifier` | -                         | The options: a list of labels, or a map of label to description                        |
| `questions`    | Provider     | -                         | Questions to ask about each prompt, as a map of question ID to API question            |
| `images`       | All          | -                         | Drex Max only: up to 8 images, as file paths, data URLs, or base64, rendered with vars |

Rubrics, `levels`, `instructions`, and label descriptions must be strings; Drex rejects objects there with a 422 error.

Responses are cached like those of other providers; use `--no-cache` to force fresh calls. Promptfoo backs off and retries `429 Too Many Requests` and `529 Overloaded` responses, honoring `Retry-After`.

When Drex is the provider under test (`questions`), Promptfoo reports cost at Nace's [published prices](https://console.nace.ai/docs/drex/reference/pricing), image tokens included: $0.03 per million input tokens for `drex-max` and `drex-max-v1.1`, and $0.06 for `drex-v2.0`. Output tokens are not billed. `llm-rubric` and `classifier` results record Drex's token usage but not its cost.

## Limitations

- As a grader, Drex supports only `llm-rubric` and `classifier`. Other model-graded assertions, such as `factuality`, `g-eval`, and the RAG metrics, send a text-generation prompt that Drex can't answer.
- `llm-rubric` reads the rubric and output directly and ignores `rubricPrompt`.
- Each assertion is a separate request. To ask several questions in one request, use [`questions`](#test-your-own-questions).
- Token limits differ by model and version, and image tokens count toward them. `drex-v2.0` takes a 131,072-token state and 262,144 tokens for the state plus the longest question. See Nace's [limits page](https://console.nace.ai/docs/drex/reference/limits).
- As with any model grader, output text that claims to satisfy the rubric can raise the score. Check grading quality on representative outputs before relying on a threshold, and don't use Drex as the only grader for red team or other adversarial outputs.

## Data handling

Grading sends the output and rubric to Nace, along with any `levels` and `images`. Classification sends the output, `instructions`, and `labels`. Nace's [Terms of Service, Section 5.7](https://console.nace.ai/terms) and [Privacy Notice, Section 6](https://console.nace.ai/privacy) describe how Nace retains and deletes customer content and whether it is used for training. Zero retention is available only for supported processing in workspaces connected to your own storage. Review both documents before sending sensitive content, and don't submit data they say you must not submit.
