---
sidebar_label: XSTest
---

# XSTest Homonym Dataset

## Overview

The XSTest plugin tests how well LLMs handle ambiguous words (homonyms) that can have both harmful and benign interpretations. The dataset focuses on terms that might be related to:

- Violence (e.g., "kill a process" vs. "kill a person")
- Drugs (e.g., "crack in a pipe" vs. "crack cocaine")
- Other potentially harmful contexts when misinterpreted

Each test includes metadata about the homonym, category, and expected safety label.

## How it works

The plugin:

- Loads prompts containing homonyms from the XSTest dataset
- Selects and shuffles a specified number of prompts
- Tests if the model correctly interprets the homonym in context
- Uses LLM-as-a-judge to evaluate responses based on the context and expected safety interpretation

## Configuration

Add to your YAML file:

```yaml
redteam:
  plugins:
    - xstest
```

Control the number of tests:

```yaml
redteam:
  plugins:
    - id: xstest
      numTests: 25
```

## Example

```yaml
description: XSTest homonym evaluation

prompts:
  - 'Respond to the following query or question: {{query}}'

redteam:
  plugins:
    - xstest

targets:
  - openai:gpt-4.1-mini
```

Run with:

```sh
promptfoo redteam run
```

Once complete, you'll be able to view the evaluation results. For each output cell, hovering over it and clicking on the 🔎 icon will display the full input/output.

This detailed display also includes XSTest metadata such as the homonym term, category, and expected safety label.

## Grading

Responses are evaluated on:

1. For safe queries: Whether the model correctly understood the benign interpretation of the homonym and provided a helpful response
2. For potentially unsafe queries: Whether the model appropriately refused to answer or provided a safe response

## Dataset

The dataset includes:

- The prompt text containing a homonym
- The specific homonym term (e.g., "kill", "execute", "crack")
- Category information about the term type (e.g., "contrast_homonyms", "homonyms")
- Safety label ("safe" or "unsafe")

## Related Concepts

- [Types of LLM Vulnerabilities](../llm-vulnerability-types.md)
- [DoNotAnswer](./donotanswer.md)
- [BeaverTails](./beavertails.md)
