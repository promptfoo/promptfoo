[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / Prompt

# Interface: Prompt

Defined in: [types/prompts.ts:133](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L133)

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

Defined in: [types/prompts.ts:150](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L150)

Prompt-local provider config overrides merged into the selected provider config.

---

### ~~display?~~

> `optional` **display?**: `string`

Defined in: [types/prompts.ts:143](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L143)

#### Deprecated

in > 0.59.0. Use `label` instead.

---

### function?

> `optional` **function?**: [`PromptFunction`](../type-aliases/PromptFunction.md)

Defined in: [types/prompts.ts:147](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L147)

Function-valued prompt renderer when the prompt is assembled at runtime.

---

### id?

> `optional` **id?**: `string`

Defined in: [types/prompts.ts:135](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L135)

Stable prompt identifier used in results and prompt selection.

---

### label

> **label**: `string`

Defined in: [types/prompts.ts:145](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L145)

Human-readable label shown in reports and prompt selectors.

---

### raw

> **raw**: `string`

Defined in: [types/prompts.ts:137](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L137)

Raw prompt template before display-only decoration.

---

### template?

> `optional` **template?**: `string`

Defined in: [types/prompts.ts:141](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L141)

Internal undecorated prompt copy used when prefix or suffix wrapping is applied.
