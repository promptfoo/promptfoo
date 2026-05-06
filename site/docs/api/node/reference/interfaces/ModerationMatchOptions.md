---
title: 'Interface: ModerationMatchOptions'
---

Defined in: [matchers/moderation.ts:24](https://github.com/promptfoo/promptfoo/blob/main/src/matchers/moderation.ts#L24)

Input passed to `assertions.matchesModeration()`.

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

Defined in: [matchers/moderation.ts:28](https://github.com/promptfoo/promptfoo/blob/main/src/matchers/moderation.ts#L28)

Assistant response to moderate.

---

### categories?

> `optional` **categories?**: `string`[]

Defined in: [matchers/moderation.ts:30](https://github.com/promptfoo/promptfoo/blob/main/src/matchers/moderation.ts#L30)

Optional subset of moderation categories that should count as failures.

---

### userPrompt

> **userPrompt**: `string`

Defined in: [matchers/moderation.ts:26](https://github.com/promptfoo/promptfoo/blob/main/src/matchers/moderation.ts#L26)

User prompt that led to the assistant response.
