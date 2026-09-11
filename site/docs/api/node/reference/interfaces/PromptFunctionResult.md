---
title: 'Interface: PromptFunctionResult'
description: 'This generated reference page documents the supported promptfoo Node.js API contract, including stable imports, signatures, fields, and application examples.'
sidebar_position: 31
---

## Import

```ts
import type { PromptFunctionResult } from 'promptfoo';
```

Defined in: contracts/prompts.ts:98

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

<!-- prettier-ignore -->
> `optional` **config?**: `Record`\<`string`, `any`\>

Defined in: contracts/prompts.ts:102

Provider config overrides to merge for this rendered prompt.

---

### prompt

> **prompt**: `any`

Defined in: contracts/prompts.ts:100

Prompt content to send to the provider.
