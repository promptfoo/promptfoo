---
title: 'Interface: ProviderResponse'
description: 'Response shape returned by custom providers. See the supported promptfoo Node.js API imports, signatures, fields, and application examples for this symbol.'
sidebar_position: 36
---

## Import

```ts
import type { ProviderResponse } from 'promptfoo';
```

Defined in: [src/contracts/providers.ts:175](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L175)

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

Defined in: [src/contracts/providers.ts:274](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L274)

Audio attachment returned by audio-capable providers.

---

### cached?

> `optional` **cached?**: `boolean`

Defined in: [src/contracts/providers.ts:177](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L177)

Whether the response came from cache.

---

### conversationEnded?

> `optional` **conversationEnded?**: `boolean`

Defined in: [src/contracts/providers.ts:261](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L261)

Indicates the target intentionally ended the active conversation/session.
Multi-turn redteam strategies can use this to stop probing gracefully.

---

### conversationEndReason?

> `optional` **conversationEndReason?**: `string`

Defined in: [src/contracts/providers.ts:266](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L266)

Optional machine-readable reason explaining why the conversation ended.
Example: `thread_closed`.

---

### cost?

> `optional` **cost?**: `number`

Defined in: [src/contracts/providers.ts:179](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L179)

Estimated request cost when the provider can report it.

---

### error?

> `optional` **error?**: `string`

Defined in: [src/contracts/providers.ts:183](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L183)

Error message when the provider call failed without throwing.

---

### finishReason?

> `optional` **finishReason?**: `string`

Defined in: [src/contracts/providers.ts:272](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L272)

Provider-reported completion stop reason.

---

### format?

> `optional` **format?**: `string`

Defined in: [src/contracts/providers.ts:201](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L201)

Optional format hint for `output` (e.g. `'json'` when `output` is a JSON string).

---

### guardrails?

> `optional` **guardrails?**: [`GuardrailResponse`](GuardrailResponse.md)

Defined in: [src/contracts/providers.ts:270](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L270)

Structured guardrail metadata returned by providers that run moderation checks.

---

### images?

> `optional` **images?**: [`ImageOutput`](ImageOutput.md)[]

Defined in: [src/contracts/providers.ts:278](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L278)

Image attachments returned by image-capable providers.

---

### incurredCost?

> `optional` **incurredCost?**: `number`

Defined in: [src/contracts/providers.ts:181](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L181)

Actual target-provider cost incurred during this run, excluding response-cache replays.

---

### inputMaterialization?

<!-- prettier-ignore -->
> `optional` **inputMaterialization?**: `Record`\<`string`, `unknown`\>

Defined in: [src/contracts/providers.ts:247](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L247)

Input materialization metadata returned by a remote Promptfoo server.

---

### isBase64?

> `optional` **isBase64?**: `boolean`

Defined in: [src/contracts/providers.ts:197](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L197)

Indicates that `output` contains base64-encoded binary data (often as JSON like OpenAI `b64_json`).
Used to enable blob externalization and avoid token bloat in downstream grading/agentic strategies.

---

### isRefusal?

> `optional` **isRefusal?**: `boolean`

Defined in: [src/contracts/providers.ts:256](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L256)

Whether the provider identified the output as a refusal.

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [src/contracts/providers.ts:205](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L205)

End-to-end provider latency in milliseconds.

---

### logProbs?

> `optional` **logProbs?**: `number`[]

Defined in: [src/contracts/providers.ts:203](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L203)

Token-level log probabilities when exposed by the provider.

---

### materializationHandled?

> `optional` **materializationHandled?**: `boolean`

Defined in: [src/contracts/providers.ts:188](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L188)

Indicates that a remote Promptfoo server already materialized multi-input vars
for this response. When true, callers must not re-materialize locally.

---

### materializedVars?

<!-- prettier-ignore -->
> `optional` **materializedVars?**: `Record`\<`string`, `string`\>

Defined in: [src/contracts/providers.ts:192](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L192)

Materialized per-input vars returned by a remote Promptfoo server.

---

### metadata?

> `optional` **metadata?**: `object`

Defined in: [src/contracts/providers.ts:211](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L211)

Additional provider-specific metadata preserved on the result row. The
named keys below are recognized by built-in features; providers can add
arbitrary additional keys.

#### Index Signature

\[`key`: `string`\]: `any`

#### http?

> `optional` **http?**: `object`

HTTP transport details retained by HTTP-based providers.

##### http.headers?

<!-- prettier-ignore -->
> `optional` **headers?**: `Record`\<`string`, `string`\>

Response headers returned by the upstream HTTP service.

##### http.requestHeaders?

<!-- prettier-ignore -->
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

Defined in: [src/contracts/providers.ts:243](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L243)

Main provider output consumed by assertions and result rendering. Most
providers return a string; complex providers may return a JSON object.

---

### prompt?

> `optional` **prompt?**: `string` \| [`ChatMessage`](ChatMessage.md)[]

Defined in: [src/contracts/providers.ts:236](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L236)

The actual prompt sent to the LLM. If set by a provider, this overrides
the rendered prompt for display and assertions.

Useful for providers that dynamically generate or modify prompts
(e.g., GenAIScript, multi-turn strategies, agent frameworks).

Can be a simple string or an array of chat messages.

---

### providerTransformedOutput?

> `optional` **providerTransformedOutput?**: `any`

Defined in: [src/contracts/providers.ts:252](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L252)

Output after provider-level transform. Used by contextTransform to ensure
it operates on provider-normalized output, independent of test transforms.

---

### raw?

> `optional` **raw?**: `any`

Defined in: [src/contracts/providers.ts:238](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L238)

Raw provider payload retained for advanced consumers.

---

### sessionId?

> `optional` **sessionId?**: `string`

Defined in: [src/contracts/providers.ts:268](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L268)

Stable conversation or thread id returned by session-aware providers.

---

### tokenUsage?

> `optional` **tokenUsage?**: `object`

Defined in: [src/contracts/providers.ts:254](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L254)

Provider-reported token usage.

#### assertions?

> `optional` **assertions?**: `object`

##### assertions.cached?

> `optional` **cached?**: `number`

##### assertions.completion?

> `optional` **completion?**: `number`

##### assertions.completionDetails?

> `optional` **completionDetails?**: `object`

##### assertions.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### assertions.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### assertions.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### assertions.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### assertions.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### assertions.numRequests?

> `optional` **numRequests?**: `number`

##### assertions.prompt?

> `optional` **prompt?**: `number`

##### assertions.total?

> `optional` **total?**: `number`

#### attacker?

> `optional` **attacker?**: `object`

##### attacker.cached?

> `optional` **cached?**: `number`

##### attacker.completion?

> `optional` **completion?**: `number`

##### attacker.completionDetails?

> `optional` **completionDetails?**: `object`

##### attacker.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### attacker.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### attacker.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### attacker.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### attacker.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### attacker.numRequests?

> `optional` **numRequests?**: `number`

##### attacker.prompt?

> `optional` **prompt?**: `number`

##### attacker.total?

> `optional` **total?**: `number`

#### cached?

> `optional` **cached?**: `number`

#### completion?

> `optional` **completion?**: `number`

#### completionDetails?

> `optional` **completionDetails?**: `object`

##### completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

#### generation?

> `optional` **generation?**: `object`

##### generation.cached?

> `optional` **cached?**: `number`

##### generation.completion?

> `optional` **completion?**: `number`

##### generation.completionDetails?

> `optional` **completionDetails?**: `object`

##### generation.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### generation.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### generation.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### generation.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### generation.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### generation.numRequests?

> `optional` **numRequests?**: `number`

##### generation.prompt?

> `optional` **prompt?**: `number`

##### generation.total?

> `optional` **total?**: `number`

#### incurredTokenUsage?

> `optional` **incurredTokenUsage?**: `object`

##### incurredTokenUsage.assertions?

> `optional` **assertions?**: `object`

##### incurredTokenUsage.assertions.cached?

> `optional` **cached?**: `number`

##### incurredTokenUsage.assertions.completion?

> `optional` **completion?**: `number`

##### incurredTokenUsage.assertions.completionDetails?

> `optional` **completionDetails?**: `object`

##### incurredTokenUsage.assertions.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### incurredTokenUsage.assertions.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### incurredTokenUsage.assertions.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### incurredTokenUsage.assertions.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### incurredTokenUsage.assertions.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### incurredTokenUsage.assertions.numRequests?

> `optional` **numRequests?**: `number`

##### incurredTokenUsage.assertions.prompt?

> `optional` **prompt?**: `number`

##### incurredTokenUsage.assertions.total?

> `optional` **total?**: `number`

##### incurredTokenUsage.attacker?

> `optional` **attacker?**: `object`

##### incurredTokenUsage.attacker.cached?

> `optional` **cached?**: `number`

##### incurredTokenUsage.attacker.completion?

> `optional` **completion?**: `number`

##### incurredTokenUsage.attacker.completionDetails?

> `optional` **completionDetails?**: `object`

##### incurredTokenUsage.attacker.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### incurredTokenUsage.attacker.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### incurredTokenUsage.attacker.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### incurredTokenUsage.attacker.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### incurredTokenUsage.attacker.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### incurredTokenUsage.attacker.numRequests?

> `optional` **numRequests?**: `number`

##### incurredTokenUsage.attacker.prompt?

> `optional` **prompt?**: `number`

##### incurredTokenUsage.attacker.total?

> `optional` **total?**: `number`

##### incurredTokenUsage.cached?

> `optional` **cached?**: `number`

##### incurredTokenUsage.completion?

> `optional` **completion?**: `number`

##### incurredTokenUsage.completionDetails?

> `optional` **completionDetails?**: `object`

##### incurredTokenUsage.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### incurredTokenUsage.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### incurredTokenUsage.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### incurredTokenUsage.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### incurredTokenUsage.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### incurredTokenUsage.generation?

> `optional` **generation?**: `object`

##### incurredTokenUsage.generation.cached?

> `optional` **cached?**: `number`

##### incurredTokenUsage.generation.completion?

> `optional` **completion?**: `number`

##### incurredTokenUsage.generation.completionDetails?

> `optional` **completionDetails?**: `object`

##### incurredTokenUsage.generation.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### incurredTokenUsage.generation.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### incurredTokenUsage.generation.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### incurredTokenUsage.generation.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### incurredTokenUsage.generation.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### incurredTokenUsage.generation.numRequests?

> `optional` **numRequests?**: `number`

##### incurredTokenUsage.generation.prompt?

> `optional` **prompt?**: `number`

##### incurredTokenUsage.generation.total?

> `optional` **total?**: `number`

##### incurredTokenUsage.numRequests?

> `optional` **numRequests?**: `number`

##### incurredTokenUsage.prompt?

> `optional` **prompt?**: `number`

##### incurredTokenUsage.total?

> `optional` **total?**: `number`

#### numRequests?

> `optional` **numRequests?**: `number`

#### prompt?

> `optional` **prompt?**: `number`

#### total?

> `optional` **total?**: `number`

---

### video?

> `optional` **video?**: [`VideoOutput`](VideoOutput.md)

Defined in: [src/contracts/providers.ts:276](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L276)

Video attachment returned by video-capable providers.
