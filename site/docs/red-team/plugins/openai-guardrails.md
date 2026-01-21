---
title: OpenAI Guardrails Plugin
sidebar_label: OpenAI Guardrails
description: Red team jailbreak resistance using OpenAI's eval dataset to test LLM responses to role-playing attacks, system manipulation, and obfuscation techniques
---

# OpenAI Guardrails Plugin

The OpenAI Guardrails plugin uses the jailbreak eval dataset from [OpenAI's Guardrails Python package](https://github.com/openai/openai-guardrails-python) to test LLM responses to known jailbreak attempts. The dataset contains real-world jailbreak patterns designed to circumvent AI safety guidelines, including:

- Role-playing attacks (e.g., "You are DAN", "Act as an unethical chatbot")
- System manipulation (e.g., token-based jailbreaks, prompt injection via special formatting)
- Obfuscation techniques (e.g., character encoding, linguistic evasion)
- Multi-turn jailbreak strategies (e.g., "life token" systems, cumulative manipulation)

This plugin helps evaluate whether your LLM maintains safety boundaries when faced with sophisticated adversarial prompts used in real-world jailbreak attempts.

## How it works

The plugin:

- Loads jailbreak prompts from OpenAI's eval dataset
- Filters for prompts expected to trigger jailbreak guardrails
- Shuffles and selects a specified number of test cases
- Tests whether the model refuses or complies with jailbreak attempts
- Uses LLM-as-a-judge to evaluate responses based on strict safety criteria

## Configuration

Add to your configuration:

```yaml title="promptfooconfig.yaml"
redteam:
  plugins:
    - openai-guardrails
```

Control the number of tests:

```yaml title="promptfooconfig.yaml"
redteam:
  plugins:
    - id: openai-guardrails
      numTests: 25
```

### Testing for Over-Blocking

By default, OpenAI Guardrails tests only jailbreak attempts to ensure your model refuses harmful content. However, you can also test for over-blocking (false positives) by including safe prompts:

```yaml title="promptfooconfig.yaml"
redteam:
  plugins:
    - id: openai-guardrails
      config:
        includeSafe: true
      numTests: 20
```

When `includeSafe: true` is set:

- Test cases are split 50/50 between safe and jailbreak prompts
- Safe prompts use inverted grading logic: they SHOULD be answered (not refused)
- This helps identify if your guardrails are too strict and block legitimate requests
- Metadata includes `isSafe` and `label` fields for filtering and analysis

## Example

```yaml title="promptfooconfig.yaml"
description: OpenAI Guardrails jailbreak eval

prompts:
  - 'Respond to the following: {{prompt}}'

redteam:
  plugins:
    - openai-guardrails

targets:
  - openai:gpt-4o-mini
```

Run with:

```sh
promptfoo redteam run
```

## Grading

Responses are evaluated strictly on whether the model:

- **Passes**: Clearly refuses the jailbreak attempt, identifies it as against usage policies, or maintains appropriate boundaries
- **Fails**: Complies with the jailbreak request, engages with harmful aspects, or provides workarounds to accomplish harmful goals

The grading is intentionally strict - any indication that the model engaged with the harmful aspects of the jailbreak is considered a failure.

## Dataset

The dataset includes jailbreak attempts from OpenAI's internal eval suite, each labeled with:

- Unique identifier for tracking
- The jailbreak prompt text
- Expected guardrail triggers (e.g., "Jailbreak": true)

The dataset contains approximately 51 jailbreak prompts and 49 safe prompts. If you request more tests than available, the plugin returns all available prompts with a "Partial" status.

## Related Concepts

- [Types of LLM Vulnerabilities](../llm-vulnerability-types.md)
- [HarmBench Plugin](./harmbench.md)
- [System Prompt Override](./system-prompt-override.md)
- [Prompt Injection](./indirect-prompt-injection.md)
- [BeaverTails Plugin](./beavertails.md)

For a comprehensive overview of LLM vulnerabilities and red teaming strategies, visit our [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) page.
