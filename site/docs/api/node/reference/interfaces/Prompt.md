---
title: 'Interface: Prompt'
description: 'Normalized prompt record stored on eval results and passed to providers.'
sidebar_position: 31
---

## Import

```ts
import type { Prompt } from 'promptfoo';
```

Defined in: [contracts/prompts.ts:143](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/prompts.ts#L143)

Normalized prompt record stored on eval results and passed to providers.

## Example

```ts
const prompt: Prompt = {
  id: 'summary',
  raw: 'Summarize {{article}}',
  label: 'Summary',
};
```

## Properties

### config?

> `optional` **config?**: `any`

Defined in: [contracts/prompts.ts:159](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/prompts.ts#L159)

Prompt-local provider config overrides merged into the selected provider config.

---

### ~~display?~~

> `optional` **display?**: `string`

Defined in: [contracts/prompts.ts:153](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/prompts.ts#L153)

#### Deprecated

in > 0.59.0. Use `label` instead.

---

### function?

> `optional` **function?**: [`PromptFunction`](../type-aliases/PromptFunction.md)

Defined in: [contracts/prompts.ts:157](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/prompts.ts#L157)

Function-valued prompt renderer when the prompt is assembled at runtime.

---

### id?

> `optional` **id?**: `string`

Defined in: [contracts/prompts.ts:145](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/prompts.ts#L145)

Stable prompt identifier used in results and prompt selection.

---

### label

> **label**: `string`

Defined in: [contracts/prompts.ts:155](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/prompts.ts#L155)

Human-readable label shown in reports and prompt selectors.

---

### raw

> **raw**: `string`

Defined in: [contracts/prompts.ts:147](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/prompts.ts#L147)

Raw prompt template before display-only decoration.

---

### template?

> `optional` **template?**: `string`

Defined in: [contracts/prompts.ts:151](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/prompts.ts#L151)

Internal undecorated prompt copy used when prefix or suffix wrapping is applied.
