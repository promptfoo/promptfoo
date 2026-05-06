---
title: 'Interface: EvaluateTableRow'
---

Defined in: [types/index.ts:630](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L630)

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

Defined in: [types/index.ts:632](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L632)

Optional human-readable description for the row's test case.

---

### outputs

> **outputs**: [`EvaluateTableOutput`](EvaluateTableOutput.md)[]

Defined in: [types/index.ts:634](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L634)

Provider outputs rendered across this row.

---

### test

> **test**: [`AtomicTestCase`](AtomicTestCase.md)

Defined in: [types/index.ts:638](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L638)

Test case represented by this row.

---

### testIdx

> **testIdx**: `number`

Defined in: [types/index.ts:640](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L640)

Zero-based index of the test case in the eval.

---

### vars

> **vars**: `string`[]

Defined in: [types/index.ts:636](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L636)

Rendered variable values shown in the table row.
