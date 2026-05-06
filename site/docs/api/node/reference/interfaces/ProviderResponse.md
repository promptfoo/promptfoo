---
title: 'Interface: ProviderResponse'
description: 'Response shape returned by custom providers.'
---

## Import

```ts
import type { ProviderResponse } from 'promptfoo';
```

Defined in: [types/providers.ts:518](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L518)

Response shape returned by custom providers.

Return `output` for a successful call or `error` when the provider handled a
failure without throwing. Use attachments and metadata only when the provider
can supply them; most text providers only need `output`.

## Example

```ts
const response: ProviderResponse = {
  output: 'Hello Ada',
  tokenUsage: { total: 3, prompt: 1, completion: 2 },
  metadata: { model: 'custom-echo-v1' },
};
```

## Properties

### audio?

> `optional` **audio?**: [`AudioOutput`](AudioOutput.md)

Defined in: [types/providers.ts:619](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L619)

Audio attachment returned by audio-capable providers.

---

### cached?

> `optional` **cached?**: `boolean`

Defined in: [types/providers.ts:520](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L520)

Whether the response came from cache.

---

### conversationEnded?

> `optional` **conversationEnded?**: `boolean`

Defined in: [types/providers.ts:606](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L606)

Indicates the target intentionally ended the active conversation/session.
Multi-turn redteam strategies can use this to stop probing gracefully.

---

### conversationEndReason?

> `optional` **conversationEndReason?**: `string`

Defined in: [types/providers.ts:611](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L611)

Optional machine-readable reason explaining why the conversation ended.
Example: `thread_closed`.

---

### cost?

> `optional` **cost?**: `number`

Defined in: [types/providers.ts:522](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L522)

Estimated request cost when the provider can report it.

---

### error?

> `optional` **error?**: `string`

Defined in: [types/providers.ts:524](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L524)

Error message when the provider call failed without throwing.

---

### finishReason?

> `optional` **finishReason?**: `string`

Defined in: [types/providers.ts:617](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L617)

Provider-reported completion stop reason.

---

### format?

> `optional` **format?**: `string`

Defined in: [types/providers.ts:542](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L542)

Optional format hint for `output` (e.g. `'json'` when `output` is a JSON string).

---

### guardrails?

> `optional` **guardrails?**: [`GuardrailResponse`](GuardrailResponse.md)

Defined in: [types/providers.ts:615](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L615)

Structured guardrail metadata returned by providers that run moderation checks.

---

### images?

> `optional` **images?**: [`ImageOutput`](ImageOutput.md)[]

Defined in: [types/providers.ts:623](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L623)

Image attachments returned by image-capable providers.

---

### inputMaterialization?

> `optional` **inputMaterialization?**: `Record`\<`string`, `unknown`\>

Defined in: [types/providers.ts:591](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L591)

Input materialization metadata returned by a remote Promptfoo server.

---

### isBase64?

> `optional` **isBase64?**: `boolean`

Defined in: [types/providers.ts:538](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L538)

Indicates that `output` contains base64-encoded binary data (often as JSON like OpenAI `b64_json`).
Used to enable blob externalization and avoid token bloat in downstream grading/agentic strategies.

---

### isRefusal?

> `optional` **isRefusal?**: `boolean`

Defined in: [types/providers.ts:601](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L601)

Whether the provider identified the output as a refusal.

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [types/providers.ts:546](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L546)

End-to-end provider latency in milliseconds.

---

### logProbs?

> `optional` **logProbs?**: `number`[]

Defined in: [types/providers.ts:544](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L544)

Token-level log probabilities when exposed by the provider.

---

### materializationHandled?

> `optional` **materializationHandled?**: `boolean`

Defined in: [types/providers.ts:529](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L529)

Indicates that a remote Promptfoo server already materialized multi-input vars
for this response. When true, callers must not re-materialize locally.

---

### materializedVars?

> `optional` **materializedVars?**: `Record`\<`string`, `string`\>

Defined in: [types/providers.ts:533](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L533)

Materialized per-input vars returned by a remote Promptfoo server.

---

### metadata?

> `optional` **metadata?**: `object`

Defined in: [types/providers.ts:552](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L552)

Additional provider-specific metadata preserved on the result row. The
named keys below are recognized by built-in features; providers can add
arbitrary additional keys.

#### Index Signature

\[`key`: `string`\]: `any`

#### http?

> `optional` **http?**: `object`

HTTP transport details retained by HTTP-based providers.

##### http.headers?

> `optional` **headers?**: `Record`\<`string`, `string`\>

Response headers returned by the upstream HTTP service.

##### http.requestHeaders?

> `optional` **requestHeaders?**: `Record`\<`string`, `string`\>

Request headers sent to the upstream HTTP service.

##### http.status

> **status**: `number`

Response status code returned by the upstream HTTP service.

##### http.statusText

> **statusText**: `string`

Response status text returned by the upstream HTTP service.

#### redteamFinalPrompt?

> `optional` **redteamFinalPrompt?**: `string`

Final prompt sent by some red team flows after mutation or wrapping.

---

### output?

> `optional` **output?**: `any`

Defined in: [types/providers.ts:587](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L587)

Main provider output consumed by assertions and result rendering. Most
providers return a string; complex providers may return a JSON object.

---

### prompt?

> `optional` **prompt?**: `string` \| [`ChatMessage`](ChatMessage.md)[]

Defined in: [types/providers.ts:578](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L578)

The actual prompt sent to the LLM. If set by a provider, this overrides
the rendered prompt for display and assertions.

Useful for providers that dynamically generate or modify prompts
(e.g., GenAIScript, multi-turn strategies, agent frameworks).

Can be a simple string or an array of chat messages.

---

### providerTransformedOutput?

> `optional` **providerTransformedOutput?**: `any`

Defined in: [types/providers.ts:597](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L597)

Output after provider-level transform. Used by contextTransform to ensure
it operates on provider-normalized output, independent of test transforms.

---

### raw?

> `optional` **raw?**: `any`

Defined in: [types/providers.ts:581](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L581)

Raw provider payload retained for advanced consumers.

---

### sessionId?

> `optional` **sessionId?**: `string`

Defined in: [types/providers.ts:613](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L613)

Stable conversation or thread id returned by session-aware providers.

---

### tokenUsage?

> `optional` **tokenUsage?**: [`TokenUsage`](TokenUsage.md)

Defined in: [types/providers.ts:599](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L599)

Provider-reported token usage.

---

### video?

> `optional` **video?**: [`VideoOutput`](VideoOutput.md)

Defined in: [types/providers.ts:621](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L621)

Video attachment returned by video-capable providers.
