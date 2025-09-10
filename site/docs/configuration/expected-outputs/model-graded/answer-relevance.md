---
sidebar_label: Answer Relevance
description: 'Score LLM response relevance and completeness against user queries using sophisticated AI-powered evaluation metrics'
---

# Answer relevance

The `answer-relevance` assertion checks if the LLM response answers the user's question.

## Basic usage

```yaml
assert:
  - type: answer-relevance
    threshold: 0.8
```

## Related assertions

- [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric) - For custom relevance criteria
- [`similar`](/docs/configuration/expected-outputs/similar) - For semantic similarity to expected answers
