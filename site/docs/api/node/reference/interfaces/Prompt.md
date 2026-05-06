---
title: 'Interface: Prompt'
---

Defined in: [types/prompts.ts:136](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L136)

Normalized prompt record stored on eval results and passed to providers.

## Example

```ts
const prompt: Prompt = {
  id: 'summary',
  raw: 'Summarize {{article}}',
  label: 'Summary',
};
```

## Extended by

- [`CompletedPrompt`](CompletedPrompt.md)

## Properties

### config?

> `optional` **config?**: `any`

Defined in: [types/prompts.ts:153](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L153)

Prompt-local provider config overrides merged into the selected provider config.

---

### ~~display?~~

> `optional` **display?**: `string`

Defined in: [types/prompts.ts:146](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L146)

#### Deprecated

in > 0.59.0. Use `label` instead.

---

### function?

> `optional` **function?**: [`PromptFunction`](../type-aliases/PromptFunction.md)

Defined in: [types/prompts.ts:150](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L150)

Function-valued prompt renderer when the prompt is assembled at runtime.

---

### id?

> `optional` **id?**: `string`

Defined in: [types/prompts.ts:138](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L138)

Stable prompt identifier used in results and prompt selection.

---

### label

> **label**: `string`

Defined in: [types/prompts.ts:148](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L148)

Human-readable label shown in reports and prompt selectors.

---

### raw

> **raw**: `string`

Defined in: [types/prompts.ts:140](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L140)

Raw prompt template before display-only decoration.

---

### template?

> `optional` **template?**: `string`

Defined in: [types/prompts.ts:144](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L144)

Internal undecorated prompt copy used when prefix or suffix wrapping is applied.
