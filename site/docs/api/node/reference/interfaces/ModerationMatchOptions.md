---
title: 'Interface: ModerationMatchOptions'
description: 'Input passed to assertions.matchesModeration(). See the supported promptfoo Node.js API imports, signatures, fields, and application examples for this symbol.'
sidebar_position: 26
---

## Import

```ts
import type { ModerationMatchOptions } from 'promptfoo';
```

Defined in: matchers/moderation.ts:33

Input passed to `assertions.matchesModeration()`.

Pass both sides of the exchange so moderation providers can inspect the
triggering prompt as well as the model response. Use `categories` to narrow
failures when only specific policy buckets matter to the test.

## Example

```ts
const options: ModerationMatchOptions = {
  userPrompt: 'Tell me a joke.',
  assistantResponse: 'Here is one...',
  categories: ['violence'],
};
```

## Properties

### assistantResponse

> **assistantResponse**: `string`

Defined in: matchers/moderation.ts:37

Assistant response to moderate.

---

### categories?

> `optional` **categories?**: `string`[]

Defined in: matchers/moderation.ts:39

Optional subset of moderation categories that should count as failures.

---

### userPrompt

> **userPrompt**: `string`

Defined in: matchers/moderation.ts:35

User prompt that led to the assistant response.
