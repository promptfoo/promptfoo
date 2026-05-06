[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / EvaluateTable

# Interface: EvaluateTable

Defined in: [types/index.ts:578](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L578)

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

Defined in: [types/index.ts:582](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L582)

Ordered table rows, one per evaluated test case.

---

### head

> **head**: [`EvaluateTableHead`](EvaluateTableHead.md)

Defined in: [types/index.ts:580](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L580)

Prompt and variable headers rendered above the table body.
