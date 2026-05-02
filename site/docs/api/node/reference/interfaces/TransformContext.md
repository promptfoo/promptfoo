[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / TransformContext

# Interface: TransformContext

Defined in: [types/transform.ts:6](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/transform.ts#L6)

Metadata supplied to every transform invocation. Known fields are typed;
the open index signature preserves extensibility for plugins that attach
their own keys at runtime.

## Indexable

> \[`key`: `string`\]: `unknown`

## Properties

### metadata?

> `optional` **metadata?**: `Record`\<`string`, `unknown`\>

Defined in: [types/transform.ts:9](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/transform.ts#L9)

---

### prompt?

> `optional` **prompt?**: `Record`\<`string`, `unknown`\> \| [`TransformPrompt`](TransformPrompt.md)

Defined in: [types/transform.ts:8](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/transform.ts#L8)

---

### uuid?

> `optional` **uuid?**: `string`

Defined in: [types/transform.ts:10](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/transform.ts#L10)

---

### vars?

> `optional` **vars?**: `Record`\<`string`, `unknown`\>

Defined in: [types/transform.ts:7](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/transform.ts#L7)
