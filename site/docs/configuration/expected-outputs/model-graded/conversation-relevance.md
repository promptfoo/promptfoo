---
sidebar_position: 25
description: 'Evaluate conversation coherence by checking if LLM responses maintain context relevance across multi-turn dialogues'
---

# Conversation relevance

The `conversation-relevance` assertion evaluates whether responses remain relevant throughout multi-turn conversations.

## Basic usage

```yaml
assert:
  - type: conversation-relevance
    threshold: 0.8
```

## Related assertions

- [`answer-relevance`](/docs/configuration/expected-outputs/model-graded/answer-relevance) - For single-turn relevance evaluation
- [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric) - For custom conversation evaluation criteria
