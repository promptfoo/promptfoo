---
title: 'Interface: EvaluateTable'
---

Defined in: [types/index.ts:676](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L676)

Table-shaped eval output used by `generateTable()` and the web UI.

## Example

```ts
const table: EvaluateTable = {
  head: { prompts: [], vars: ['name'] },
  body: [],
};
```

## Properties

### body

> **body**: [`EvaluateTableRow`](EvaluateTableRow.md)[]

Defined in: [types/index.ts:680](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L680)

Ordered table rows, one per evaluated test case.

---

### head

> **head**: [`EvaluateTableHead`](EvaluateTableHead.md)

Defined in: [types/index.ts:678](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L678)

Prompt and variable headers rendered above the table body.
