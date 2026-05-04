[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / generateTable

# Function: generateTable()

> **generateTable**(`evaluateTable`, `tableCellMaxLength?`, `maxRows?`): `string`

Defined in: [table.ts:20](https://github.com/promptfoo/promptfoo/blob/main/src/table.ts#L20)

Render eval table data as terminal-friendly text.

Usually pass the table from a completed eval record returned by `evaluate()`.

## Parameters

### evaluateTable

[`EvaluateTable`](../interfaces/EvaluateTable.md)

Table data returned on the completed eval record.

### tableCellMaxLength?

`number` = `250`

Maximum visible width for each rendered cell.

### maxRows?

`number` = `25`

Maximum number of body rows to render.

## Returns

`string`

## Example

```ts
const evalRecord = await evaluate(testSuite);
console.log(generateTable(evalRecord.table));
```
