---
title: 'Interface: ConversationMessage'
---

Defined in: [external/matchers/deepeval.ts:35](https://github.com/promptfoo/promptfoo/blob/main/src/external/matchers/deepeval.ts#L35)

One user / assistant exchange used by conversation-relevance grading.

## Example

```ts
const message: ConversationMessage = {
  input: 'What is promptfoo?',
  output: 'An eval framework for LLM applications.',
};
```

## Properties

### input

> **input**: `string`

Defined in: [external/matchers/deepeval.ts:37](https://github.com/promptfoo/promptfoo/blob/main/src/external/matchers/deepeval.ts#L37)

User input for this turn.

---

### output

> **output**: `string` \| `object`

Defined in: [external/matchers/deepeval.ts:39](https://github.com/promptfoo/promptfoo/blob/main/src/external/matchers/deepeval.ts#L39)

Assistant output for this turn. Structured outputs are stringified before grading.
