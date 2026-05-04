[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ProviderResponse

# Interface: ProviderResponse

Defined in: [types/providers.ts:299](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L299)

Response shape returned by custom providers.

## Properties

### audio?

> `optional` **audio?**: [`AudioOutput`](AudioOutput.md)

Defined in: [types/providers.ts:383](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L383)

Audio attachment returned by audio-capable providers.

---

### cached?

> `optional` **cached?**: `boolean`

Defined in: [types/providers.ts:301](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L301)

Whether the response came from cache.

---

### conversationEnded?

> `optional` **conversationEnded?**: `boolean`

Defined in: [types/providers.ts:370](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L370)

Indicates the target intentionally ended the active conversation/session.
Multi-turn redteam strategies can use this to stop probing gracefully.

---

### conversationEndReason?

> `optional` **conversationEndReason?**: `string`

Defined in: [types/providers.ts:375](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L375)

Optional machine-readable reason explaining why the conversation ended.
Example: `thread_closed`.

---

### cost?

> `optional` **cost?**: `number`

Defined in: [types/providers.ts:303](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L303)

Estimated request cost when the provider can report it.

---

### error?

> `optional` **error?**: `string`

Defined in: [types/providers.ts:305](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L305)

Error message when the provider call failed without throwing.

---

### finishReason?

> `optional` **finishReason?**: `string`

Defined in: [types/providers.ts:381](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L381)

Provider-reported completion stop reason.

---

### format?

> `optional` **format?**: `string`

Defined in: [types/providers.ts:323](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L323)

Optional format hint for `output` (e.g. `'json'` when `output` is a JSON string).

---

### guardrails?

> `optional` **guardrails?**: `GuardrailResponse`

Defined in: [types/providers.ts:379](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L379)

Structured guardrail metadata returned by providers that run moderation checks.

---

### images?

> `optional` **images?**: [`ImageOutput`](ImageOutput.md)[]

Defined in: [types/providers.ts:387](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L387)

Image attachments returned by image-capable providers.

---

### inputMaterialization?

> `optional` **inputMaterialization?**: `Record`\<`string`, `unknown`\>

Defined in: [types/providers.ts:356](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L356)

Input materialization metadata returned by a remote Promptfoo server.

---

### isBase64?

> `optional` **isBase64?**: `boolean`

Defined in: [types/providers.ts:319](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L319)

Indicates that `output` contains base64-encoded binary data (often as JSON like OpenAI `b64_json`).
Used to enable blob externalization and avoid token bloat in downstream grading/agentic strategies.

---

### isRefusal?

> `optional` **isRefusal?**: `boolean`

Defined in: [types/providers.ts:365](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L365)

Whether the provider identified the output as a refusal.

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [types/providers.ts:327](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L327)

End-to-end provider latency in milliseconds.

---

### logProbs?

> `optional` **logProbs?**: `number`[]

Defined in: [types/providers.ts:325](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L325)

Token-level log probabilities when exposed by the provider.

---

### materializationHandled?

> `optional` **materializationHandled?**: `boolean`

Defined in: [types/providers.ts:310](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L310)

Indicates that a remote Promptfoo server already materialized multi-input vars
for this response. When true, callers must not re-materialize locally.

---

### materializedVars?

> `optional` **materializedVars?**: `Record`\<`string`, `string`\>

Defined in: [types/providers.ts:314](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L314)

Materialized per-input vars returned by a remote Promptfoo server.

---

### metadata?

> `optional` **metadata?**: `object`

Defined in: [types/providers.ts:329](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L329)

Additional provider-specific metadata preserved on the result row.

#### Index Signature

\[`key`: `string`\]: `any`

#### http?

> `optional` **http?**: `object`

##### http.headers?

> `optional` **headers?**: `Record`\<`string`, `string`\>

##### http.requestHeaders?

> `optional` **requestHeaders?**: `Record`\<`string`, `string`\>

##### http.status

> **status**: `number`

##### http.statusText

> **statusText**: `string`

#### redteamFinalPrompt?

> `optional` **redteamFinalPrompt?**: `string`

---

### output?

> `optional` **output?**: `any`

Defined in: [types/providers.ts:352](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L352)

Main provider output consumed by assertions and result rendering.

---

### prompt?

> `optional` **prompt?**: `string` \| `ChatMessage`[]

Defined in: [types/providers.ts:348](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L348)

The actual prompt sent to the LLM. If set by a provider, this overrides
the rendered prompt for display and assertions.

Useful for providers that dynamically generate or modify prompts
(e.g., GenAIScript, multi-turn strategies, agent frameworks).

Can be a simple string or an array of chat messages.

---

### providerTransformedOutput?

> `optional` **providerTransformedOutput?**: `any`

Defined in: [types/providers.ts:361](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L361)

Output after provider-level transform. Used by contextTransform to ensure
it operates on provider-normalized output, independent of test transforms.

---

### raw?

> `optional` **raw?**: `any`

Defined in: [types/providers.ts:350](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L350)

Raw provider payload retained for advanced consumers.

---

### sessionId?

> `optional` **sessionId?**: `string`

Defined in: [types/providers.ts:377](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L377)

Stable conversation or thread id returned by session-aware providers.

---

### tokenUsage?

> `optional` **tokenUsage?**: `object`

Defined in: [types/providers.ts:363](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L363)

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

Defined in: [types/providers.ts:385](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L385)

Video attachment returned by video-capable providers.
