---
sidebar_position: 101
sidebar_label: Guardrails
---

# Guardrails

Use the `guardrails` assert type to ensure that LLM outputs pass safety checks based on the provider's built-in guardrails.

This assertion checks if the provider's response includes guardrails information and verifies that the content hasn't been flagged for safety concerns.

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

## Redteaming Configuration

When using guardrails assertions for redteaming scenarios, you should specify the `guardrails` property:

```yaml
assert:
  - type: guardrails
    config:
      purpose: redteam
```

This changes the pass/fail logic of the assertion:

- If the provider's guardrails blocks the content, the test **passes** (indicating the attack was successfully blocked)
- If the guardrails passes the content, the assertion doesn't impact the final test result (the test will be graded based on other assertions)

## How it works

The guardrails assertion checks for:

- Input safety: Whether the prompt contains unsafe content
- Output safety: Whether the LLM's response contains unsafe content

The assertion will:

- Pass (score: 1) if the content passes all safety checks
- Fail (score: 0) if either the input or output is flagged
- Pass with score 0 if no guardrails was applied

When content is flagged, the assertion provides specific feedback about whether it was the input or output that failed the safety checks.

## Provider Support

The guardrails assertion is currently supported on:

- AWS Bedrock with Amazon Guardrails enabled
- Azure OpenAI with Content Filters enabled

Other providers do not currently support this assertion type. The assertion will pass with a score of 0 for unsupported providers.
