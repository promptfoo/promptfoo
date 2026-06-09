---
title: 'Interface: PromptFunctionResult'
description: 'Result type for prompt functions.'
sidebar_position: 33
---

## Import

```ts
import type { PromptFunctionResult } from 'promptfoo';
```

Defined in: [contracts/prompts.ts:98](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/prompts.ts#L98)

Result type for prompt functions.

Return this wrapper only when a prompt function needs to pair rendered prompt
content with per-prompt config overrides; otherwise returning `PromptContent`
directly is simpler.

Prompt functions can return:

- A string (used directly as the prompt)
- An object/array (JSON stringified and used as the prompt)
- A PromptFunctionResult object with prompt and optional config

## Example

```ts
const result: PromptFunctionResult = {
  prompt: 'Summarize this article.',
  config: { temperature: 0.2 },
};
```

## Properties

### config?

> `optional` **config?**: `Record`\<`string`, `any`\>

Defined in: [contracts/prompts.ts:102](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/prompts.ts#L102)

Provider config overrides to merge for this rendered prompt.

---

### prompt

> **prompt**: `any`

Defined in: [contracts/prompts.ts:100](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/prompts.ts#L100)

Prompt content to send to the provider.
