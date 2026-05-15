---
title: 'Interface: EvaluateTableRow'
description: 'One row in an eval table.'
---

## Import

```ts
import type { EvaluateTableRow } from 'promptfoo';
```

Defined in: [types/index.ts:648](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L648)

One row in an eval table.

## Example

```ts
import { ResultFailureReason } from 'promptfoo';

const output: EvaluateTableOutput = {
  cost: 0,
  failureReason: ResultFailureReason.NONE,
  id: 'result-1',
  latencyMs: 120,
  namedScores: { mentions_name: 1 },
  pass: true,
  prompt: 'Hello {{name}}',
  score: 1,
  testCase: { vars: { name: 'Ada' } },
  text: 'Hello Ada',
};

const row: EvaluateTableRow = {
  outputs: [output],
  vars: ['Ada'],
  test: { vars: { name: 'Ada' } },
  testIdx: 0,
};
```

## Properties

### description?

> `optional` **description?**: `string`

Defined in: [types/index.ts:650](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L650)

Optional human-readable description for the row's test case.

---

### outputs

> **outputs**: [`EvaluateTableOutput`](EvaluateTableOutput.md)[]

Defined in: [types/index.ts:652](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L652)

Provider outputs rendered across this row.

---

### test

> **test**: [`AtomicTestCase`](AtomicTestCase.md)

Defined in: [types/index.ts:656](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L656)

Test case represented by this row.

---

### testIdx

> **testIdx**: `number`

Defined in: [types/index.ts:658](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L658)

Zero-based index of the test case in the eval.

---

### vars

> **vars**: `string`[]

Defined in: [types/index.ts:654](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L654)

Rendered variable values shown in the table row.
