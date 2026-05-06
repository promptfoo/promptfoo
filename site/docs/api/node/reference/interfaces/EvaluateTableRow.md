[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / EvaluateTableRow

# Interface: EvaluateTableRow

Defined in: [types/index.ts:640](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L640)

One row in an eval table.

## Example

```ts
const row: EvaluateTableRow = {
  outputs: [],
  vars: ['Ada'],
  test: { vars: { name: 'Ada' } },
  testIdx: 0,
};
```

## Properties

### description?

> `optional` **description?**: `string`

Defined in: [types/index.ts:642](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L642)

Optional human-readable description for the row's test case.

---

### outputs

> **outputs**: [`EvaluateTableOutput`](EvaluateTableOutput.md)[]

Defined in: [types/index.ts:644](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L644)

Provider outputs rendered across this row.

---

### test

> **test**: [`AtomicTestCase`](AtomicTestCase.md)

Defined in: [types/index.ts:648](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L648)

Test case represented by this row.

---

### testIdx

> **testIdx**: `number`

Defined in: [types/index.ts:650](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L650)

Zero-based index of the test case in the eval.

---

### vars

> **vars**: `string`[]

Defined in: [types/index.ts:646](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L646)

Rendered variable values shown in the table row.
