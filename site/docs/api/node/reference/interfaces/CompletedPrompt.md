---
title: 'Interface: CompletedPrompt'
---

Defined in: [types/index.ts:488](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L488)

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

Defined in: [types/prompts.ts:153](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L153)

Prompt-local provider config overrides merged into the selected provider config.

#### Inherited from

[`Prompt`](Prompt.md).[`config`](Prompt.md#config)

---

### ~~display?~~

> `optional` **display?**: `string`

Defined in: [types/prompts.ts:146](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L146)

#### Deprecated

in > 0.59.0. Use `label` instead.

#### Inherited from

[`Prompt`](Prompt.md).[`display`](Prompt.md#display)

---

### function?

> `optional` **function?**: [`PromptFunction`](../type-aliases/PromptFunction.md)

Defined in: [types/prompts.ts:150](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L150)

Function-valued prompt renderer when the prompt is assembled at runtime.

#### Inherited from

[`Prompt`](Prompt.md).[`function`](Prompt.md#function)

---

### id?

> `optional` **id?**: `string`

Defined in: [types/prompts.ts:138](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L138)

Stable prompt identifier used in results and prompt selection.

#### Inherited from

[`Prompt`](Prompt.md).[`id`](Prompt.md#id)

---

### label

> **label**: `string`

Defined in: [types/prompts.ts:148](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L148)

Human-readable label shown in reports and prompt selectors.

#### Inherited from

[`Prompt`](Prompt.md).[`label`](Prompt.md#label)

---

### metrics?

> `optional` **metrics?**: [`PromptMetrics`](PromptMetrics.md)

Defined in: [types/index.ts:492](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L492)

Aggregate metrics accumulated for this prompt.

---

### provider

> **provider**: `string`

Defined in: [types/index.ts:490](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L490)

Provider id associated with the completed prompt column.

---

### raw

> **raw**: `string`

Defined in: [types/prompts.ts:140](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L140)

Raw prompt template before display-only decoration.

#### Inherited from

[`Prompt`](Prompt.md).[`raw`](Prompt.md#raw)

---

### template?

> `optional` **template?**: `string`

Defined in: [types/prompts.ts:144](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L144)

Internal undecorated prompt copy used when prefix or suffix wrapping is applied.

#### Inherited from

[`Prompt`](Prompt.md).[`template`](Prompt.md#template)
