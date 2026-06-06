---
title: 'Interface: EvaluateTable'
description: 'Table-shaped eval output used by generateTable() and the web UI.'
---

## Import

```ts
import type { EvaluateTable } from 'promptfoo';
```

Defined in: [types/index.ts:693](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L693)

Table-shaped eval output used by `generateTable()` and the web UI.

Read this when you need the presentation-oriented table model. Use the eval
record summary APIs instead when you need per-result analysis rather than
terminal or UI rendering.

## Example

```ts
import { ResultFailureReason } from 'promptfoo';

const table: EvaluateTable = {
  head: {
    prompts: [{ raw: 'Hello {{name}}', label: 'Greeting', provider: 'custom:echo' }],
    vars: ['name'],
  },
  body: [
    {
      outputs: [
        {
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
        },
      ],
      vars: ['Ada'],
      test: { vars: { name: 'Ada' } },
      testIdx: 0,
    },
  ],
};
```

## Properties

### body

> **body**: [`EvaluateTableRow`](EvaluateTableRow.md)[]

Defined in: [types/index.ts:697](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L697)

Ordered table rows, one per evaluated test case.

---

### head

> **head**: [`EvaluateTableHead`](EvaluateTableHead.md)

Defined in: [types/index.ts:695](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L695)

Prompt and variable headers rendered above the table body.
