# OpenAI Pricing Integration Audit

Date started: 2026-05-01

Goal: verify every OpenAI spend surface that this provider can reasonably observe, separate exact-cost paths from estimate-only paths, and leave a concrete plan for any spend that cannot be proven from a single provider response.

## Audit principles

1. Prefer returned usage ledgers over locally inferred token counts whenever the API exposes them.
2. Only call a cost exact when the response contains enough detail to distinguish all billed dimensions used by the pricing table.
3. Treat Promptfoo cache hits separately from provider-side cached input tokens.
4. Keep call-based hosted-tool fees separate from token-ledger cost.
5. If a charge depends on state outside the current response, do not pretend it is exact.

## Surface inventory

| Surface                      | Promptfoo path                  | Spend shape                                       | Exact from current response?         | Planned verification                                             |
| ---------------------------- | ------------------------------- | ------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| Chat Completions text        | `openai:chat:*`                 | input, cached input, output                       | yes                                  | live standard + cached prompt + service tier                     |
| Legacy Completions           | `openai:completion:*`           | input, output                                     | yes                                  | live legacy smoke if model still available                       |
| Responses text               | `openai:responses:*`            | input, cached input, output                       | yes                                  | live standard + cached prompt + service tier                     |
| Responses web search         | `openai:responses:*`            | token ledger + per-search action fee              | partly                               | live search/open/find output inspection                          |
| Responses file search        | `openai:responses:*`            | token ledger + per-call fee                       | partly                               | live vector-store-backed call if fixture can be created          |
| Responses code interpreter   | `openai:responses:*`            | token ledger + container/session charge           | no                                   | document why exact attribution is not possible from one response |
| Embeddings                   | `openai:embedding:*`            | input tokens only                                 | yes                                  | live embedding call                                              |
| Realtime text/audio          | `openai:realtime:*`             | text/audio/image/cached input + text/audio output | yes                                  | live text/audio session and ledger inspection                    |
| Image API generations        | `openai:image:*`                | model-specific image/text/image-token pricing     | sometimes                            | live `gpt-image-2`, `gpt-image-1.5`, fallback table checks       |
| Image API edits / variations | not exposed by current provider | separate image spend                              | no                                   | record as unsupported provider surface                           |
| Audio transcription          | `openai:transcription:*`        | per-minute audio pricing                          | no new billing helper path           | verify existing provider behavior separately                     |
| Agents SDK                   | `openai:agents:*`               | may span handoffs/models/tools                    | no                                   | keep `cost: undefined` unless per-step provenance is available   |
| Python Agents SDK            | Python provider example         | aggregate multi-request token ledger              | no automatic exact dollar cost       | preserve request/cached/reasoning detail; require explicit cost  |
| Codex SDK                    | `openai:codex-sdk`              | token ledger with cached input                    | yes when requested model is known    | shared OpenAI billing helper                                     |
| Codex app-server             | `openai:codex-app-server`       | token ledger with cached input                    | yes when requested model is known    | shared OpenAI billing helper                                     |
| OpenCode SDK                 | `opencode:sdk`                  | provider-reported aggregate cost                  | passthrough when SDK reports cost    | preserve returned cost; leave missing cost undefined             |
| Batch                        | batch API / returned tier       | discounted model pricing                          | yes when tier is known               | verify via docs + returned/configured tier logic                 |
| Flex                         | `service_tier: flex`            | model-specific discount                           | yes when tier is known and supported | live/fixture verification                                        |
| Priority                     | `service_tier: priority`        | model-specific premium pricing                    | yes when tier is known               | live/fixture verification                                        |

## Current findings and fixes

- Fixed 2026-05-01: Realtime billing now accepts documented singular `input_token_details` / `output_token_details` fields.
- Fixed 2026-05-01: Web-search hosted-tool fees are only charged for `action.type === "search"`, not `open_page` or `find_in_page`.
- Fixed 2026-05-01: OpenAI provider docs now state that Promptfoo infers Batch/Flex/Priority pricing when the response or configured `service_tier` identifies the tier.
- Fixed 2026-05-01: Standard `web_search` tool calls are priced at the standard web-search rate instead of being mistaken for non-reasoning `web_search_preview`.
- Fixed 2026-05-01: Transcription responses that omit `duration` no longer report a false zero-dollar cost.
- Fixed 2026-05-01: Codex SDK and Codex app-server now reuse the shared OpenAI billing helper instead of duplicated stale local rate tables.
- Fixed 2026-05-01: `gpt-5.1-codex-mini` and GPT-5.3 coding-model cached-input rates are included in the shared helper.
- Fixed 2026-05-01: Codex unknown-model / unknown-usage costs and OpenCode missing costs now remain undefined instead of being reported as zero.
- Fixed 2026-05-02: The Python Agents SDK example now preserves the SDK's request count, cached-input tokens, and reasoning-token detail instead of letting fresh runs collapse to `numRequests: 1`.

## Verification checklist

- [x] Re-read current OpenAI official pricing/docs for text, cached input, batch, flex, priority, images, realtime, embeddings, and hosted tools.
- [x] Run focused unit coverage for billing helpers and affected provider tests.
- [x] Run live Chat Completions standard request.
- [x] Run live Chat Completions repeated cached-prompt request.
- [x] Run live Responses standard request.
- [x] Run live Responses repeated cached-prompt request.
- [x] Run live Responses web-search request and inspect emitted action types.
- [x] Attempt live Responses file-search request with a disposable vector-store fixture.
- [x] Document Code Interpreter/container attribution limits.
- [x] Run live Embeddings request.
- [x] Run live Realtime request and inspect the raw usage ledger.
- [x] Run live Image API requests for supported current models and compare exact usage vs fallback estimate behavior.
- [x] Check unsupported or estimate-only surfaces: image edits, variations, Agents, transcription, audio speech, moderation, video.
- [x] Audit agentic integrations: Agents SDK, Codex SDK, Codex app-server, OpenCode SDK.
- [x] Audit the Python Agents SDK example and reconcile its usage ledger with the SDK's current reporting surface.
- [x] Re-run `tsc`, focused Vitest, lint/format.

## Running notes

- Existing live examples worth reusing from prior work: `examples/openai-audio/promptfooconfig.yaml`, `examples/openai-realtime/test-webui-audio.yaml`, and `examples/openai-images/promptfooconfig.yaml`.
- `openai:image` in Promptfoo is currently generations-only; edits/reference inputs/variations are outside the provider surface.
- Realtime official responses use singular usage detail keys, while Responses API ledgers use plural detail keys.
- Search-tool pricing is action-sensitive: `search` incurs a fee; `open_page` and `find_in_page` are observable but not separately billed.
- Live Chat Completions probe (`gpt-5.4-mini`) returned 37 input / 61 output tokens and Promptfoo computed `$0.00030225`, matching 37 x `$0.75/M` + 61 x `$4.50/M`.
- Live Responses probe (`gpt-5.4-nano`) returned 134 input / 39 output tokens and Promptfoo computed `$0.00007555`, matching 134 x `$0.20/M` + 39 x `$1.25/M`.
- Live `gpt-image-2` probe returned 16 text-input / 196 image-output tokens and cost `$0.00596`, matching 16 x `$5/M` + 196 x `$30/M`.
- Live `gpt-image-1.5` probe returned 16 text-input / 226 text-output / 272 image-output tokens and cost `$0.011044`, so the Image API currently does expose enough detail for exact pricing on this request.
- Live `gpt-realtime` probe returned singular Realtime usage fields with 12 text-input, 19 text-output, and 50 audio-output tokens; Promptfoo computed `$0.003552`, matching the published Realtime ledger rates.
- Live `gpt-4o` Responses `web_search` probe emitted one `search` action. Before the fix Promptfoo charged `$0.025` for the tool call; the standard `web_search` table says this should be `$0.010`.
- Live `text-embedding-3-small` direct provider probe returned 4 input tokens and cost `$0.00000008`, matching `$0.02/M`.
- Live `gpt-4o-mini-transcribe` probe returned a transcription but no duration, so the pre-fix provider reported `$0`. `whisper-1` on the same file returned `duration: 24.1200008392334` and cost `$0.0024120000839233397`; exact GPT-4o transcription cost is not available from the current JSON response alone.
- Live Chat Completions cache probe (`gpt-4.1-mini`) returned 4,216 prompt tokens twice; the second response reported `prompt_tokens_details.cached_tokens: 4096`.
- Live Responses cache probe (`gpt-5-mini`) returned 4,211 input tokens twice; the second response reported `input_tokens_details.cached_tokens: 4096`.
- Live Responses image-input probe (`gpt-4.1-mini`) returned 190 input / 242 output tokens and cost `$0.0004632`; because image input is billed at the model input-token rate here, the total input-token ledger is sufficient even without a separate `image_tokens` breakout.
- Live file-search probe used a disposable vector store and returned one `file_search_call` plus 1,156 input / 44 output tokens. Exact observable cost is `$0.0030328` = token cost `$0.0005328` + one `$0.0025` file-search call.
- Live Code Interpreter probe returned a `code_interpreter_call` with a `container_id`, but the response itself does not say whether that container was newly created or reused. The token ledger is exact; the container-session charge is not attributable from one response alone.
- Live direct tier probes on `gpt-5-mini` returned `service_tier: "flex"` and `service_tier: "priority"` respectively, confirming the API echoes the charged tier needed for exact tier-aware pricing.
- Legacy completion smoke (`gpt-3.5-turbo-instruct`) returned 4 input / 3 output tokens and cost `$0.000012`, matching `$1.50/M` both ways.
- Unsupported or intentionally non-exact surfaces:
  - Image edits and image variations are outside the current `openai:image` provider surface.
  - Agents SDK runs can span multiple models and handoffs, so aggregate cost should stay `undefined` unless per-step provenance becomes available.
  - The Python Agents SDK example now returns accurate aggregate request/cached/reasoning usage, but a generic Python provider still cannot infer exact dollars for mixed-model or hosted-tool graphs without explicit provider-side accounting.
  - Codex SDK/app-server cost is exact only when Promptfoo knows the requested model id; unknown or backend-resolved aliases stay undefined.
  - Codex app-server `service_tier: fast` may consume higher Codex credits, but the app-server token-usage payload does not expose enough billing metadata to convert that into an exact spend figure.
  - OpenCode SDK cost is treated as authoritative only when OpenCode reports one; missing cost stays undefined.
  - GPT-4o transcription models can return no duration in `json`, making exact per-minute cost unavailable from the response.
  - Code Interpreter container-session spend is response-external state.
  - Moderation is documented as free.
  - Video generation uses explicit per-second pricing from the requested model/duration rather than a response token ledger.
