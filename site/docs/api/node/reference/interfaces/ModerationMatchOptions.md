---
title: 'Interface: ModerationMatchOptions'
description: 'Input passed to assertions.matchesModeration().'
---

## Import

```ts
import type { ModerationMatchOptions } from 'promptfoo';
```

Defined in: [matchers/moderation.ts:28](https://github.com/promptfoo/promptfoo/blob/main/src/matchers/moderation.ts#L28)

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

Defined in: [matchers/moderation.ts:32](https://github.com/promptfoo/promptfoo/blob/main/src/matchers/moderation.ts#L32)

Assistant response to moderate.

---

### categories?

> `optional` **categories?**: `string`[]

Defined in: [matchers/moderation.ts:34](https://github.com/promptfoo/promptfoo/blob/main/src/matchers/moderation.ts#L34)

Optional subset of moderation categories that should count as failures.

---

### userPrompt

> **userPrompt**: `string`

Defined in: [matchers/moderation.ts:30](https://github.com/promptfoo/promptfoo/blob/main/src/matchers/moderation.ts#L30)

User prompt that led to the assistant response.
