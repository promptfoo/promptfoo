[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / EvaluateTable

# Interface: EvaluateTable

Defined in: [types/index.ts:517](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L517)

Table-shaped eval output used by `generateTable()` and the web UI.

## Properties

### body

> **body**: [`EvaluateTableRow`](EvaluateTableRow.md)[]

Defined in: [types/index.ts:521](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L521)

Ordered table rows, one per evaluated test case.

---

### head

> **head**: [`EvaluateTableHead`](EvaluateTableHead.md)

Defined in: [types/index.ts:519](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L519)

Prompt and variable headers rendered above the table body.
