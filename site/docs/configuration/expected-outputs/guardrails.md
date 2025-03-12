---
sidebar_position: 101
sidebar_label: Guardrails
---

# Guardrails

Use the `guardrails` assert type to ensure that LLM outputs pass safety checks based on the provider's built-in guardrails.

This assertion checks both input and output content against provider guardrails. Input guardrails typically detect prompt injections and jailbreak attempts, while output guardrails check for harmful content categories like hate speech, violence, or inappropriate material based on your guardrails configuration. The assertion verifies that neither the input nor output have been flagged for safety concerns.

## Provider Support

The guardrails assertion is currently supported on:

- AWS Bedrock with [Amazon Guardrails](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-create.html) enabled
- Azure OpenAI with [Content Filters](https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/content-filter?tabs=warning%2Cuser-prompt%2Cpython-new) enabled

Other providers do not currently support this assertion type. The assertion will pass with a score of 0 for unsupported providers.

## Basic Usage

Here's a basic example of using the guardrail assertion:

```yaml
tests:
  - vars:
      prompt: 'Your test prompt'
    assert:
      - type: guardrails
```

You can also set it as a default test assertion:

```yaml
defaultTest:
  assert:
    - type: guardrails
```

:::note

Pass/fail logic of the assertion:

- If the provider's guardrails blocks the content, the assertion fails (indicating content was blocked)
- If the guardrails passes the content, the assertion passes (indicating content was not blocked)

:::

:::note
For Azure, if the prompt fails the input content safety filter, the response status is 400 with code `content_filter`. In this case, the guardrails assertion passes.
:::

## Redteaming Configuration

When using guardrails assertions for redteaming scenarios, you should specify the `guardrails` property:

```yaml
assert:
  - type: guardrails
    config:
      purpose: redteam
```

:::note

This changes the pass/fail logic of the assertion:

- If the provider's guardrails blocks the content, the test **passes** (indicating the attack was successfully blocked)
- If the guardrails passes the content, the assertion doesn't impact the final test result (the test will be graded based on other assertions)

:::

## How it works

The guardrails assertion checks for:

- Input safety
- Output safety

The assertion will:

- Pass (score: 1) if the content passes all safety checks
- Fail (score: 0) if either the input or output is flagged
- Pass with score 0 if no guardrails was applied

When content is flagged, the assertion provides specific feedback about whether it was the input or output that failed the safety checks.
