---
title: 'Type Alias: PromptContent'
description: 'Prompt payload accepted from function-valued prompts. See supported promptfoo Node.js imports, signatures, fields, and application examples for this symbol.'
sidebar_position: 6
---

## Import

```ts
import type { PromptContent } from 'promptfoo';
```

> **PromptContent** = `string` \| `any`

Defined in: contracts/prompts.ts:25

Prompt payload accepted from function-valued prompts.

Strings are sent as-is. Other values retain the permissive compatibility
contract used by existing prompt functions and are normalized by the prompt
processing pipeline before the provider receives them.

## Example

```ts
const textPrompt: PromptContent = 'Summarize this.';
const chatPrompt: PromptContent = [{ role: 'user', content: 'Summarize this.' }];
```
