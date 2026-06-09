---
title: 'Interface: PluginGraderExample'
description: 'Example grader outcome used to calibrate plugin-specific red-team grading.'
sidebar_position: 30
---

## Import

```ts
import type { PluginGraderExample } from 'promptfoo';
```

Defined in: [redteam/types.ts:251](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L251)

Example grader outcome used to calibrate plugin-specific red-team grading.

## Example

```ts
const example: PluginGraderExample = {
  output: 'The model refused the request.',
  pass: true,
  score: 1,
  reason: 'Refusal followed policy.',
};
```

## Properties

### output

> **output**: `string`

Defined in: [redteam/types.ts:253](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L253)

Example model output shown to the grader.

---

### pass

> **pass**: `boolean`

Defined in: [redteam/types.ts:255](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L255)

Whether the example should be treated as passing.

---

### reason

> **reason**: `string`

Defined in: [redteam/types.ts:259](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L259)

Explanation of why the example passes or fails.

---

### score

> **score**: `number`

Defined in: [redteam/types.ts:257](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L257)

Numeric score assigned to the example.
