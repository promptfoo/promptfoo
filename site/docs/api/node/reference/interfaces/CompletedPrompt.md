[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / CompletedPrompt

# Interface: CompletedPrompt

Defined in: [types/index.ts:498](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L498)

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

Defined in: [types/prompts.ts:150](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L150)

Prompt-local provider config overrides merged into the selected provider config.

#### Inherited from

[`Prompt`](Prompt.md).[`config`](Prompt.md#config)

---

### ~~display?~~

> `optional` **display?**: `string`

Defined in: [types/prompts.ts:143](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L143)

#### Deprecated

in > 0.59.0. Use `label` instead.

#### Inherited from

[`Prompt`](Prompt.md).[`display`](Prompt.md#display)

---

### function?

> `optional` **function?**: [`PromptFunction`](../type-aliases/PromptFunction.md)

Defined in: [types/prompts.ts:147](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L147)

Function-valued prompt renderer when the prompt is assembled at runtime.

#### Inherited from

[`Prompt`](Prompt.md).[`function`](Prompt.md#function)

---

### id?

> `optional` **id?**: `string`

Defined in: [types/prompts.ts:135](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L135)

Stable prompt identifier used in results and prompt selection.

#### Inherited from

[`Prompt`](Prompt.md).[`id`](Prompt.md#id)

---

### label

> **label**: `string`

Defined in: [types/prompts.ts:145](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L145)

Human-readable label shown in reports and prompt selectors.

#### Inherited from

[`Prompt`](Prompt.md).[`label`](Prompt.md#label)

---

### metrics?

> `optional` **metrics?**: [`PromptMetrics`](PromptMetrics.md)

Defined in: [types/index.ts:502](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L502)

Aggregate metrics accumulated for this prompt.

---

### provider

> **provider**: `string`

Defined in: [types/index.ts:500](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L500)

Provider id associated with the completed prompt column.

---

### raw

> **raw**: `string`

Defined in: [types/prompts.ts:137](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L137)

Raw prompt template before display-only decoration.

#### Inherited from

[`Prompt`](Prompt.md).[`raw`](Prompt.md#raw)

---

### template?

> `optional` **template?**: `string`

Defined in: [types/prompts.ts:141](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L141)

Internal undecorated prompt copy used when prefix or suffix wrapping is applied.

#### Inherited from

[`Prompt`](Prompt.md).[`template`](Prompt.md#template)
