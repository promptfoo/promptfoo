---
title: 'Interface: PluginGraderExample'
description: 'This generated reference page documents the supported promptfoo Node.js API contract, including stable imports, signatures, fields, and application examples.'
sidebar_position: 28
---

## Import

```ts
import type { PluginGraderExample } from 'promptfoo';
```

Defined in: redteam/types.ts:251

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

Defined in: redteam/types.ts:253

Example model output shown to the grader.

---

### pass

> **pass**: `boolean`

Defined in: redteam/types.ts:255

Whether the example should be treated as passing.

---

### reason

> **reason**: `string`

Defined in: redteam/types.ts:259

Explanation of why the example passes or fails.

---

### score

> **score**: `number`

Defined in: redteam/types.ts:257

Numeric score assigned to the example.
