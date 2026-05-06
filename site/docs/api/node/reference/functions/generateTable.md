[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / generateTable

# Function: generateTable()

> **generateTable**(`evaluateTable`, `tableCellMaxLength?`, `maxRows?`): `string`

Defined in: [table.ts:29](https://github.com/promptfoo/promptfoo/blob/main/src/table.ts#L29)

Render eval table data as terminal-friendly text.

Usually pass the table from a completed eval record returned by `evaluate()`.

## Parameters

### evaluateTable

[`EvaluateTable`](../interfaces/EvaluateTable.md)

Table data returned on the completed eval record. Pass
the value resolved from `await evalRecord.getTable()`.

### tableCellMaxLength?

`number` = `250`

Maximum visible width for each rendered cell.

### maxRows?

`number` = `25`

Maximum number of body rows to render.

## Returns

`string`

ANSI-colored terminal text for the table.

## Example

```ts
import { evaluate, generateTable } from 'promptfoo';

const evalRecord = await evaluate(testSuite);
const table = await evalRecord.getTable();
console.log(generateTable(table));
```
