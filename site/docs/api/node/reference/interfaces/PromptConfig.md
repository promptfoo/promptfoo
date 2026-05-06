---
title: 'Interface: PromptConfig'
description: 'Prompt-local text decoration applied before provider execution.'
---

## Import

```ts
import type { PromptConfig } from 'promptfoo';
```

Defined in: [types/prompts.ts:43](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L43)

Prompt-local text decoration applied before provider execution.

This only changes rendered prompt text. Use provider configuration for model
settings such as temperature, retries, or auth.

## Example

```ts
const config: PromptConfig = {
  prefix: 'System: ',
  suffix: '\nAnswer briefly.',
};
```

## Extended by

- [`TestCaseOptions`](TestCaseOptions.md)

## Properties

### prefix?

> `optional` **prefix?**: `string`

Defined in: [types/prompts.ts:45](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L45)

Text prepended to the rendered prompt before it is sent to the provider.

---

### suffix?

> `optional` **suffix?**: `string`

Defined in: [types/prompts.ts:47](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L47)

Text appended to the rendered prompt before it is sent to the provider.
