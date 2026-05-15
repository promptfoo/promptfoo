---
title: 'Interface: CompletedPrompt'
description: 'Prompt metadata attached to completed eval results.'
---

## Import

```ts
import type { CompletedPrompt } from 'promptfoo';
```

Defined in: [types/index.ts:489](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L489)

Prompt metadata attached to completed eval results.

## Example

```ts
const prompt: CompletedPrompt = {
  raw: 'Hello {{name}}',
  label: 'Greeting',
  provider: 'custom:echo',
};
```

## Extends

- [`Prompt`](Prompt.md)

## Properties

### config?

> `optional` **config?**: `any`

Defined in: [contracts/prompts.ts:159](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/prompts.ts#L159)

Prompt-local provider config overrides merged into the selected provider config.

#### Inherited from

[`Prompt`](Prompt.md).[`config`](Prompt.md#config)

---

### ~~display?~~

> `optional` **display?**: `string`

Defined in: [contracts/prompts.ts:153](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/prompts.ts#L153)

#### Deprecated

in > 0.59.0. Use `label` instead.

#### Inherited from

[`Prompt`](Prompt.md).[`display`](Prompt.md#display)

---

### function?

> `optional` **function?**: [`PromptFunction`](../type-aliases/PromptFunction.md)

Defined in: [contracts/prompts.ts:157](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/prompts.ts#L157)

Function-valued prompt renderer when the prompt is assembled at runtime.

#### Inherited from

[`Prompt`](Prompt.md).[`function`](Prompt.md#function)

---

### id?

> `optional` **id?**: `string`

Defined in: [contracts/prompts.ts:145](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/prompts.ts#L145)

Stable prompt identifier used in results and prompt selection.

#### Inherited from

[`Prompt`](Prompt.md).[`id`](Prompt.md#id)

---

### label

> **label**: `string`

Defined in: [contracts/prompts.ts:155](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/prompts.ts#L155)

Human-readable label shown in reports and prompt selectors.

#### Inherited from

[`Prompt`](Prompt.md).[`label`](Prompt.md#label)

---

### metrics?

> `optional` **metrics?**: [`PromptMetrics`](PromptMetrics.md)

Defined in: [types/index.ts:493](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L493)

Aggregate metrics accumulated for this prompt.

---

### provider

> **provider**: `string`

Defined in: [types/index.ts:491](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L491)

Provider id associated with the completed prompt column.

---

### raw

> **raw**: `string`

Defined in: [contracts/prompts.ts:147](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/prompts.ts#L147)

Raw prompt template before display-only decoration.

#### Inherited from

[`Prompt`](Prompt.md).[`raw`](Prompt.md#raw)

---

### template?

> `optional` **template?**: `string`

Defined in: [contracts/prompts.ts:151](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/prompts.ts#L151)

Internal undecorated prompt copy used when prefix or suffix wrapping is applied.

#### Inherited from

[`Prompt`](Prompt.md).[`template`](Prompt.md#template)
