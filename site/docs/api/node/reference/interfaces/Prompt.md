---
title: 'Interface: Prompt'
description: 'Normalized prompt record stored on eval results and passed to providers. See supported imports, signatures, fields, examples, and usage details for this symbol.'
sidebar_position: 29
---

## Import

```ts
import type { Prompt } from 'promptfoo';
```

Defined in: contracts/prompts.ts:143

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

Defined in: contracts/prompts.ts:159

Prompt-local provider config overrides merged into the selected provider config.

---

### ~~display?~~

> `optional` **display?**: `string`

Defined in: contracts/prompts.ts:153

#### Deprecated

in > 0.59.0. Use `label` instead.

---

### function?

> `optional` **function?**: [`PromptFunction`](../type-aliases/PromptFunction.md)

Defined in: contracts/prompts.ts:157

Function-valued prompt renderer when the prompt is assembled at runtime.

---

### id?

> `optional` **id?**: `string`

Defined in: contracts/prompts.ts:145

Stable prompt identifier used in results and prompt selection.

---

### label

> **label**: `string`

Defined in: contracts/prompts.ts:155

Human-readable label shown in reports and prompt selectors.

---

### raw

> **raw**: `string`

Defined in: contracts/prompts.ts:147

Raw prompt template before display-only decoration.

---

### template?

> `optional` **template?**: `string`

Defined in: contracts/prompts.ts:151

Internal undecorated prompt copy used when prefix or suffix wrapping is applied.
