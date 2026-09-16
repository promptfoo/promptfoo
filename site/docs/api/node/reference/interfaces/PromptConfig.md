---
title: 'Interface: PromptConfig'
description: 'Prompt-local text decoration applied before provider execution. See the supported promptfoo Node.js API imports, signatures, fields, and application examples.'
sidebar_position: 30
---

## Import

```ts
import type { PromptConfig } from 'promptfoo';
```

Defined in: [src/contracts/prompts.ts:43](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/prompts.ts#L43)

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

## Properties

### prefix?

> `optional` **prefix?**: `string`

Defined in: [src/contracts/prompts.ts:45](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/prompts.ts#L45)

Text prepended to the rendered prompt before it is sent to the provider.

---

### suffix?

> `optional` **suffix?**: `string`

Defined in: [src/contracts/prompts.ts:47](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/prompts.ts#L47)

Text appended to the rendered prompt before it is sent to the provider.
