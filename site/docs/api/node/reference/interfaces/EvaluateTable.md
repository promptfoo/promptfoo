[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / EvaluateTable

# Interface: EvaluateTable

Defined in: [types/index.ts:513](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L513)

Table-shaped eval output used by `generateTable()` and the web UI.

## Properties

### body

> **body**: [`EvaluateTableRow`](EvaluateTableRow.md)[]

Defined in: [types/index.ts:517](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L517)

Ordered table rows, one per evaluated test case.

---

### head

> **head**: [`EvaluateTableHead`](EvaluateTableHead.md)

Defined in: [types/index.ts:515](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L515)

Prompt and variable headers rendered above the table body.
