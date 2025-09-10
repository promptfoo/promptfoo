---
title: Max-score assertion
description: Configure the `max-score` assertion to deterministically pick the highest-scoring output based on other assertions' scores.
sidebar_label: Max Score
---

# Max score

The `max-score` assertion automatically selects the best output based on objective scores from other assertions.

## Basic usage

```yaml
prompts:
  - 'Write a function to {{task}}'
  - 'Write an efficient function to {{task}}'

providers:
  - openai:gpt-4.1-mini

tests:
  - vars:
      task: 'calculate fibonacci numbers'
    assert:
      - type: python
        value: 'assert fibonacci(10) == 55'
      - type: llm-rubric
        value: 'Code is efficient'
      - type: max-score
```

## Related assertions

- [`select-best`](/docs/configuration/expected-outputs/model-graded/select-best) - Subjective selection using LLM judgment
- [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric) - Individual output scoring
