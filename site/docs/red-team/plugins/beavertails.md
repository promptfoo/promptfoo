---
sidebar_label: BeaverTails
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

## Configuration

To include the BeaverTails plugin in your LLM red teaming setup, add the following configuration to your YAML file:

```yaml
redteam:
  plugins:
    - beavertails
```

You can control the number of test cases using the `config.numTests` parameter (defaults to 5):

```yaml
redteam:
  plugins:
    - id: beavertails
      numTests: 25
```

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
