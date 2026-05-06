[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ProviderResponse

# Interface: ProviderResponse

Defined in: [types/providers.ts:419](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L419)

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

Defined in: [types/providers.ts:520](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L520)

Audio attachment returned by audio-capable providers.

---

### cached?

> `optional` **cached?**: `boolean`

Defined in: [types/providers.ts:421](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L421)

Whether the response came from cache.

---

### conversationEnded?

> `optional` **conversationEnded?**: `boolean`

Defined in: [types/providers.ts:507](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L507)

Indicates the target intentionally ended the active conversation/session.
Multi-turn redteam strategies can use this to stop probing gracefully.

---

### conversationEndReason?

> `optional` **conversationEndReason?**: `string`

Defined in: [types/providers.ts:512](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L512)

Optional machine-readable reason explaining why the conversation ended.
Example: `thread_closed`.

---

### cost?

> `optional` **cost?**: `number`

Defined in: [types/providers.ts:423](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L423)

Estimated request cost when the provider can report it.

---

### error?

> `optional` **error?**: `string`

Defined in: [types/providers.ts:425](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L425)

Error message when the provider call failed without throwing.

---

### finishReason?

> `optional` **finishReason?**: `string`

Defined in: [types/providers.ts:518](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L518)

Provider-reported completion stop reason.

---

### format?

> `optional` **format?**: `string`

Defined in: [types/providers.ts:443](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L443)

Optional format hint for `output` (e.g. `'json'` when `output` is a JSON string).

---

### guardrails?

> `optional` **guardrails?**: `GuardrailResponse`

Defined in: [types/providers.ts:516](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L516)

Structured guardrail metadata returned by providers that run moderation checks.

---

### images?

> `optional` **images?**: [`ImageOutput`](ImageOutput.md)[]

Defined in: [types/providers.ts:524](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L524)

Image attachments returned by image-capable providers.

---

### inputMaterialization?

> `optional` **inputMaterialization?**: `Record`\<`string`, `unknown`\>

Defined in: [types/providers.ts:492](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L492)

Input materialization metadata returned by a remote Promptfoo server.

---

### isBase64?

> `optional` **isBase64?**: `boolean`

Defined in: [types/providers.ts:439](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L439)

Indicates that `output` contains base64-encoded binary data (often as JSON like OpenAI `b64_json`).
Used to enable blob externalization and avoid token bloat in downstream grading/agentic strategies.

---

### isRefusal?

> `optional` **isRefusal?**: `boolean`

Defined in: [types/providers.ts:502](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L502)

Whether the provider identified the output as a refusal.

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [types/providers.ts:447](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L447)

End-to-end provider latency in milliseconds.

---

### logProbs?

> `optional` **logProbs?**: `number`[]

Defined in: [types/providers.ts:445](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L445)

Token-level log probabilities when exposed by the provider.

---

### materializationHandled?

> `optional` **materializationHandled?**: `boolean`

Defined in: [types/providers.ts:430](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L430)

Indicates that a remote Promptfoo server already materialized multi-input vars
for this response. When true, callers must not re-materialize locally.

---

### materializedVars?

> `optional` **materializedVars?**: `Record`\<`string`, `string`\>

Defined in: [types/providers.ts:434](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L434)

Materialized per-input vars returned by a remote Promptfoo server.

---

### metadata?

> `optional` **metadata?**: `object`

Defined in: [types/providers.ts:453](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L453)

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

Defined in: [types/providers.ts:488](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L488)

Main provider output consumed by assertions and result rendering. Most
providers return a string; complex providers may return a JSON object.

---

### prompt?

> `optional` **prompt?**: `string` \| `ChatMessage`[]

Defined in: [types/providers.ts:479](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L479)

The actual prompt sent to the LLM. If set by a provider, this overrides
the rendered prompt for display and assertions.

Useful for providers that dynamically generate or modify prompts
(e.g., GenAIScript, multi-turn strategies, agent frameworks).

Can be a simple string or an array of chat messages.

---

### providerTransformedOutput?

> `optional` **providerTransformedOutput?**: `any`

Defined in: [types/providers.ts:498](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L498)

Output after provider-level transform. Used by contextTransform to ensure
it operates on provider-normalized output, independent of test transforms.

---

### raw?

> `optional` **raw?**: `any`

Defined in: [types/providers.ts:482](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L482)

Raw provider payload retained for advanced consumers.

---

### sessionId?

> `optional` **sessionId?**: `string`

Defined in: [types/providers.ts:514](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L514)

Stable conversation or thread id returned by session-aware providers.

---

### tokenUsage?

> `optional` **tokenUsage?**: `object`

Defined in: [types/providers.ts:500](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L500)

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

##### assertions.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

##### assertions.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

##### assertions.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

##### assertions.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

##### assertions.numRequests?

> `optional` **numRequests?**: `number`

##### assertions.prompt?

> `optional` **prompt?**: `number`

##### assertions.total?

> `optional` **total?**: `number`

#### cached?

> `optional` **cached?**: `number`

#### completion?

> `optional` **completion?**: `number`

#### completionDetails?

> `optional` **completionDetails?**: `object`

##### completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

##### completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

##### completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

##### completionDetails.reasoning?

> `optional` **reasoning?**: `number`

##### completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

#### numRequests?

> `optional` **numRequests?**: `number`

#### prompt?

> `optional` **prompt?**: `number`

#### total?

> `optional` **total?**: `number`

---

### video?

> `optional` **video?**: [`VideoOutput`](VideoOutput.md)

Defined in: [types/providers.ts:522](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L522)

Video attachment returned by video-capable providers.
