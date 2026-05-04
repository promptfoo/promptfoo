[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / TransformContext

# Interface: TransformContext

Defined in: [types/transform.ts:6](https://github.com/promptfoo/promptfoo/blob/main/src/types/transform.ts#L6)

Metadata supplied to every transform invocation. Known fields are typed;
the open index signature preserves extensibility for plugins that attach
their own keys at runtime.

## Indexable

> \[`key`: `string`\]: `unknown`

## Properties

### metadata?

> `optional` **metadata?**: `Record`\<`string`, `unknown`\>

Defined in: [types/transform.ts:12](https://github.com/promptfoo/promptfoo/blob/main/src/types/transform.ts#L12)

Additional runtime metadata passed through the pipeline.

---

### prompt?

> `optional` **prompt?**: `Record`\<`string`, `unknown`\> \| [`TransformPrompt`](TransformPrompt.md)

Defined in: [types/transform.ts:10](https://github.com/promptfoo/promptfoo/blob/main/src/types/transform.ts#L10)

Prompt metadata associated with the transform call site.

---

### uuid?

> `optional` **uuid?**: `string`

Defined in: [types/transform.ts:14](https://github.com/promptfoo/promptfoo/blob/main/src/types/transform.ts#L14)

Result identifier associated with the transform invocation, when available.

---

### vars?

> `optional` **vars?**: `Record`\<`string`, `unknown`\>

Defined in: [types/transform.ts:8](https://github.com/promptfoo/promptfoo/blob/main/src/types/transform.ts#L8)

Variables available at the transform call site.
