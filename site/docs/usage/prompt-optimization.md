---
title: Prompt Optimization
sidebar_position: 11
sidebar_label: Prompt optimization
description: Optimize one prompt against one provider with promptfoo. Learn how candidate search, validation splits, target selection, and result review work.
---

# Prompt Optimization

`promptfoo optimize` improves one configured prompt against one configured provider using the tests already defined in your eval config. It runs a baseline eval, asks an optimizer model for revised prompt candidates using observed failures and prior scores, evaluates those candidates, and prints the strongest prompt it found.

Use prompt optimization when you already have:

- A prompt that needs measurable improvement
- A provider you want to tune that prompt for
- Test cases and assertions that represent the behavior you want

## Basic workflow

Start with a normal eval config:

```yaml title="promptfooconfig.yaml"
providers:
  - openai:gpt-4.1-mini

prompts:
  - |-
    Answer the user's support question.
    Be concise.

    Question: {{question}}

tests:
  - vars:
      question: How do I reset my password?
    assert:
      - type: contains
        value: reset
  - vars:
      question: Can I cancel my subscription today?
    assert:
      - type: llm-rubric
        value: The answer clearly explains the cancellation path.
```

Then run:

```sh
promptfoo optimize
```

When `-c` is omitted, promptfoo loads `promptfooconfig.yaml` from the current directory.

## Choose the prompt and provider

Optimization targets exactly one resolved prompt/provider pair. By default, promptfoo uses prompt index `0` and provider index `0`.

```sh
promptfoo optimize --prompt-index 1 --provider-index 0
```

These are zero-based indices after the config is resolved. This keeps the optimization objective narrow: one prompt is being tuned for one provider, against one test suite.

The selected provider is the target being optimized. Candidate prompt rewrites are generated separately by Promptfoo's default suggestions provider.

## Use a validation split

By default, optimization searches against the full eval set. That is fast, but it can overfit to the configured tests.

Use `--validation-split` to hold out part of the test set for candidate selection:

```sh
promptfoo optimize --validation-split 0.2
```

With `0.2`, promptfoo searches on roughly 80% of the configured tests and judges candidate adoption on the held-out 20%. The split is optional and may be any value greater than `0` and less than or equal to `0.5`.

## Practical guidance

Prompt optimization is only as good as the eval it searches against. Before optimizing:

- Make sure the tests represent the behavior you care about
- Prefer assertions that distinguish materially better outputs from merely different outputs
- Use a validation split when the test set is large enough to support one
- Tune one prompt/provider pair at a time, then compare results deliberately

For command flags and concise syntax, see the [`promptfoo optimize` CLI reference](/docs/usage/command-line#promptfoo-optimize).
