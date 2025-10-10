---
sidebar_label: BeaverTails
description: Red team LLM safety boundaries using BeaverTails dataset of 330k harmful prompts to protect AI systems from abuse, hate speech, and malicious content exploitation
---

# BeaverTails Dataset for LLM Safety Testing

## Overview

The BeaverTails plugin uses the [BeaverTails dataset](https://huggingface.co/datasets/PKU-Alignment/BeaverTails), a dataset of 330,000 prompt injections published by PKU-Alignment to test LLM systems against a comprehensive collection of potentially harmful prompts.

The dataset covers a wide range of harmful content categories including:

- Animal and human abuse
- Criminal activities and unethical behavior
- Discrimination and hate speech
- Explicit adult content
- Misinformation and dangerous advice
- Privacy violations
- Violence and terrorism

## How it works

The plugin:

- Fetches test cases from the BeaverTails dataset
- Filters out safe/benign test cases to focus on potentially harmful prompts
- Randomly selects prompts from the filtered set
- Tests if the model appropriately refuses or handles the harmful prompts

## Quick Start

1. Set your Hugging Face API token as an environment variable:

```bash
export HF_TOKEN=your_huggingface_token  # or HF_API_TOKEN
```

2. Enable the plugin in your configuration:

```yaml title="promptfooconfig.yaml"
redteam:
  plugins:
    - beavertails
```

## Configuration

You can control the number of test cases using the `numTests` parameter (defaults to 5):

```yaml
redteam:
  plugins:
    - id: beavertails
      numTests: 25
```

### Testing for Over-Blocking

By default, BeaverTails tests only unsafe prompts to ensure your model refuses harmful content. However, you can also test for over-blocking (false positives) by including safe prompts:

```yaml
redteam:
  plugins:
    - id: beavertails
      config:
        includeSafe: true
      numTests: 20
```

When `includeSafe: true` is set:

- Test cases are split 50/50 between safe and unsafe prompts
- Safe prompts use inverted grading logic: they SHOULD be answered (not refused)
- This helps identify if your guardrails are too strict and block legitimate requests
- Metadata includes `isSafe` and `label` fields for filtering and analysis

## Grading

The plugin uses a specialized grader that evaluates model outputs against a safety rubric. The grader checks if the output:

- Refuses to engage with harmful content
- Avoids promoting or assisting with harmful activities
- Maintains appropriate boundaries
- Provides safe and ethical responses

Outputs are graded as either SAFE (pass) or COMPLICIT (fail) based on these criteria.

## Related Concepts

- [Types of LLM Vulnerabilities](../llm-vulnerability-types.md)
- [Prompt Injection](../strategies/prompt-injection.md)
- [Jailbreak strategies](../strategies/composite-jailbreaks.md)
