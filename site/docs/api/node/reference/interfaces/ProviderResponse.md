---
title: 'Interface: ProviderResponse'
description: 'Response shape returned by custom providers.'
---

## Import

```ts
import type { ProviderResponse } from 'promptfoo';
```

Defined in: [types/providers.ts:494](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L494)

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

Defined in: [types/providers.ts:595](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L595)

Audio attachment returned by audio-capable providers.

---

### cached?

> `optional` **cached?**: `boolean`

Defined in: [types/providers.ts:496](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L496)

Whether the response came from cache.

---

### conversationEnded?

> `optional` **conversationEnded?**: `boolean`

Defined in: [types/providers.ts:582](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L582)

Indicates the target intentionally ended the active conversation/session.
Multi-turn redteam strategies can use this to stop probing gracefully.

---

### conversationEndReason?

> `optional` **conversationEndReason?**: `string`

Defined in: [types/providers.ts:587](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L587)

Optional machine-readable reason explaining why the conversation ended.
Example: `thread_closed`.

---

### cost?

> `optional` **cost?**: `number`

Defined in: [types/providers.ts:498](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L498)

Estimated request cost when the provider can report it.

---

### error?

> `optional` **error?**: `string`

Defined in: [types/providers.ts:500](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L500)

Error message when the provider call failed without throwing.

---

### finishReason?

> `optional` **finishReason?**: `string`

Defined in: [types/providers.ts:593](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L593)

Provider-reported completion stop reason.

---

### format?

> `optional` **format?**: `string`

Defined in: [types/providers.ts:518](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L518)

Optional format hint for `output` (e.g. `'json'` when `output` is a JSON string).

---

### guardrails?

> `optional` **guardrails?**: [`GuardrailResponse`](GuardrailResponse.md)

Defined in: [types/providers.ts:591](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L591)

Structured guardrail metadata returned by providers that run moderation checks.

---

### images?

> `optional` **images?**: [`ImageOutput`](ImageOutput.md)[]

Defined in: [types/providers.ts:599](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L599)

Image attachments returned by image-capable providers.

---

### inputMaterialization?

> `optional` **inputMaterialization?**: `Record`\<`string`, `unknown`\>

Defined in: [types/providers.ts:567](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L567)

Input materialization metadata returned by a remote Promptfoo server.

---

### isBase64?

> `optional` **isBase64?**: `boolean`

Defined in: [types/providers.ts:514](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L514)

Indicates that `output` contains base64-encoded binary data (often as JSON like OpenAI `b64_json`).
Used to enable blob externalization and avoid token bloat in downstream grading/agentic strategies.

---

### isRefusal?

> `optional` **isRefusal?**: `boolean`

Defined in: [types/providers.ts:577](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L577)

Whether the provider identified the output as a refusal.

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [types/providers.ts:522](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L522)

End-to-end provider latency in milliseconds.

---

### logProbs?

> `optional` **logProbs?**: `number`[]

Defined in: [types/providers.ts:520](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L520)

Token-level log probabilities when exposed by the provider.

---

### materializationHandled?

> `optional` **materializationHandled?**: `boolean`

Defined in: [types/providers.ts:505](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L505)

Indicates that a remote Promptfoo server already materialized multi-input vars
for this response. When true, callers must not re-materialize locally.

---

### materializedVars?

> `optional` **materializedVars?**: `Record`\<`string`, `string`\>

Defined in: [types/providers.ts:509](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L509)

Materialized per-input vars returned by a remote Promptfoo server.

---

### metadata?

> `optional` **metadata?**: `object`

Defined in: [types/providers.ts:528](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L528)

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

Defined in: [types/providers.ts:563](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L563)

Main provider output consumed by assertions and result rendering. Most
providers return a string; complex providers may return a JSON object.

---

### prompt?

> `optional` **prompt?**: `string` \| [`ChatMessage`](ChatMessage.md)[]

Defined in: [types/providers.ts:554](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L554)

The actual prompt sent to the LLM. If set by a provider, this overrides
the rendered prompt for display and assertions.

Useful for providers that dynamically generate or modify prompts
(e.g., GenAIScript, multi-turn strategies, agent frameworks).

Can be a simple string or an array of chat messages.

---

### providerTransformedOutput?

> `optional` **providerTransformedOutput?**: `any`

Defined in: [types/providers.ts:573](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L573)

Output after provider-level transform. Used by contextTransform to ensure
it operates on provider-normalized output, independent of test transforms.

---

### raw?

> `optional` **raw?**: `any`

Defined in: [types/providers.ts:557](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L557)

Raw provider payload retained for advanced consumers.

---

### sessionId?

> `optional` **sessionId?**: `string`

Defined in: [types/providers.ts:589](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L589)

Stable conversation or thread id returned by session-aware providers.

---

### tokenUsage?

> `optional` **tokenUsage?**: [`TokenUsage`](TokenUsage.md)

Defined in: [types/providers.ts:575](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L575)

Provider-reported token usage.

---

### video?

> `optional` **video?**: [`VideoOutput`](VideoOutput.md)

Defined in: [types/providers.ts:597](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L597)

Video attachment returned by video-capable providers.
