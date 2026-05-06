---
title: 'Interface: ConversationMessage'
description: 'One user / assistant exchange used by conversation-relevance grading.'
---

## Import

```ts
import type { ConversationMessage } from 'promptfoo';
```

Defined in: [external/matchers/deepeval.ts:38](https://github.com/promptfoo/promptfoo/blob/main/src/external/matchers/deepeval.ts#L38)

One user / assistant exchange used by conversation-relevance grading.

Supply messages in chronological order so the grader can judge whether the
assistant stays on topic across the full conversation, not just one turn.

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

Defined in: [external/matchers/deepeval.ts:40](https://github.com/promptfoo/promptfoo/blob/main/src/external/matchers/deepeval.ts#L40)

User input for this turn.

---

### output

> **output**: `string` \| `object`

Defined in: [external/matchers/deepeval.ts:42](https://github.com/promptfoo/promptfoo/blob/main/src/external/matchers/deepeval.ts#L42)

Assistant output for this turn. Structured outputs are stringified before grading.
