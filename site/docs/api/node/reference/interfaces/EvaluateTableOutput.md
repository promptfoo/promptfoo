[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / EvaluateTableOutput

# Interface: EvaluateTableOutput

Defined in: [types/index.ts:441](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L441)

One provider output cell in an eval table.

## Properties

### audio?

> `optional` **audio?**: [`AudioOutput`](AudioOutput.md)

Defined in: [types/index.ts:475](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L475)

Audio attachment associated with this output, when present.

---

### cost

> **cost**: `number`

Defined in: [types/index.ts:443](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L443)

Estimated cost attributed to this provider result.

---

### error?

> `optional` **error?**: `string` \| `null`

Defined in: [types/index.ts:473](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L473)

Error message when this output failed before normal grading.

---

### failureReason

> **failureReason**: `ResultFailureReason`

Defined in: [types/index.ts:445](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L445)

Failure category used when rendering an error or failed assertion.

---

### gradingResult?

> `optional` **gradingResult?**: [`GradingResult`](GradingResult.md) \| `null`

Defined in: [types/index.ts:447](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L447)

Assertion result for this provider output, when grading has run.

---

### id

> **id**: `string`

Defined in: [types/index.ts:449](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L449)

Stable result id.

---

### images?

> `optional` **images?**: [`ImageOutput`](ImageOutput.md)[]

Defined in: [types/index.ts:479](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L479)

Image attachments associated with this output, when present.

---

### latencyMs

> **latencyMs**: `number`

Defined in: [types/index.ts:451](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L451)

Provider latency in milliseconds.

---

### metadata?

> `optional` **metadata?**: `Record`\<`string`, `any`\>

Defined in: [types/index.ts:453](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L453)

Additional result metadata preserved for advanced consumers.

---

### namedScores

> **namedScores**: `Record`\<`string`, `number`\>

Defined in: [types/index.ts:455](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L455)

Named metric scores emitted by assertions for this output.

---

### pass

> **pass**: `boolean`

Defined in: [types/index.ts:457](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L457)

Whether this output passed all configured assertions.

---

### prompt

> **prompt**: `string`

Defined in: [types/index.ts:459](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L459)

Rendered prompt associated with this provider output.

---

### provider?

> `optional` **provider?**: `string`

Defined in: [types/index.ts:461](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L461)

Provider id or label shown for this output.

---

### response?

> `optional` **response?**: [`ProviderResponse`](ProviderResponse.md)

Defined in: [types/index.ts:463](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L463)

Raw provider response returned before table normalization.

---

### score

> **score**: `number`

Defined in: [types/index.ts:465](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L465)

Aggregate score for this output.

---

### testCase

> **testCase**: `object`

Defined in: [types/index.ts:467](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L467)

Test case associated with this output.

#### assert?

> `optional` **assert?**: (\{ `config?`: `Record`\<`string`, `any`\>; `contextTransform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `metric?`: `string`; `provider?`: `any`; `rubricPrompt?`: `string` \| `string`[] \| `object`[]; `threshold?`: `number`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `type`: `"regex"` \| `"moderation"` \| `` `promptfoo:redteam:${string}` `` \| `"cost"` \| `"factuality"` \| `"answer-relevance"` \| `"bleu"` \| `"classifier"` \| `"contains"` \| `"contains-all"` \| `"contains-any"` \| `"contains-html"` \| `"contains-json"` \| `"contains-sql"` \| `"contains-xml"` \| `"context-faithfulness"` \| `"context-recall"` \| `"context-relevance"` \| `"conversation-relevance"` \| `"equals"` \| `"finish-reason"` \| `"g-eval"` \| `"gleu"` \| `"guardrails"` \| `"icontains"` \| `"icontains-all"` \| `"icontains-any"` \| `"is-html"` \| `"is-json"` \| `"is-refusal"` \| `"is-sql"` \| `"is-valid-function-call"` \| `"is-valid-openai-function-call"` \| `"is-valid-openai-tools-call"` \| `"is-xml"` \| `"javascript"` \| `"latency"` \| `"levenshtein"` \| `"llm-rubric"` \| `"pi"` \| `"meteor"` \| `"model-graded-closedqa"` \| `"model-graded-factuality"` \| `"perplexity"` \| `"perplexity-score"` \| `"python"` \| `"rouge-n"` \| `"ruby"` \| `"similar"` \| `"similar:cosine"` \| `"similar:dot"` \| `"similar:euclidean"` \| `"starts-with"` \| `"tool-call-f1"` \| `"skill-used"` \| `"trajectory:goal-success"` \| `"trajectory:tool-args-match"` \| `"trajectory:step-count"` \| `"trajectory:tool-sequence"` \| `"trajectory:tool-used"` \| `"trace-error-spans"` \| `"trace-span-count"` \| `"trace-span-duration"` \| `"search-rubric"` \| `"webhook"` \| `"word-count"` \| `"not-regex"` \| `"not-moderation"` \| `"not-cost"` \| `"not-factuality"` \| `"not-answer-relevance"` \| `"not-bleu"` \| `"not-classifier"` \| `"not-contains"` \| `"not-contains-all"` \| `"not-contains-any"` \| `"not-contains-html"` \| `"not-contains-json"` \| `"not-contains-sql"` \| `"not-contains-xml"` \| `"not-context-faithfulness"` \| `"not-context-recall"` \| `"not-context-relevance"` \| `"not-conversation-relevance"` \| `"not-equals"` \| `"not-finish-reason"` \| `"not-g-eval"` \| `"not-gleu"` \| `"not-guardrails"` \| `"not-icontains"` \| `"not-icontains-all"` \| `"not-icontains-any"` \| `"not-is-html"` \| `"not-is-json"` \| `"not-is-refusal"` \| `"not-is-sql"` \| `"not-is-valid-function-call"` \| `"not-is-valid-openai-function-call"` \| `"not-is-valid-openai-tools-call"` \| `"not-is-xml"` \| `"not-javascript"` \| `"not-latency"` \| `"not-levenshtein"` \| `"not-llm-rubric"` \| `"not-pi"` \| `"not-meteor"` \| `"not-model-graded-closedqa"` \| `"not-model-graded-factuality"` \| `"not-perplexity"` \| `"not-perplexity-score"` \| `"not-python"` \| `"not-rouge-n"` \| `"not-ruby"` \| `"not-similar"` \| `"not-similar:cosine"` \| `"not-similar:dot"` \| `"not-similar:euclidean"` \| `"not-starts-with"` \| `"not-tool-call-f1"` \| `"not-skill-used"` \| `"not-trajectory:goal-success"` \| `"not-trajectory:tool-args-match"` \| `"not-trajectory:step-count"` \| `"not-trajectory:tool-sequence"` \| `"not-trajectory:tool-used"` \| `"not-trace-error-spans"` \| `"not-trace-span-count"` \| `"not-trace-span-duration"` \| `"not-search-rubric"` \| `"not-webhook"` \| `"not-word-count"` \| `"select-best"` \| `"human"` \| `"max-score"`; `value?`: `AssertionValue`; `weight?`: `number`; \} \| \{ `assert`: `object`[]; `config?`: `Record`\<`string`, `any`\>; `metric?`: `string`; `threshold?`: `number`; `type`: `"assert-set"`; `weight?`: `number`; \})[]

#### assertScoringFunction?

> `optional` **assertScoringFunction?**: `string` \| `ScoringFunction`

#### description?

> `optional` **description?**: `string`

#### metadata?

> `optional` **metadata?**: `object`

##### Index Signature

\[`key`: `string`\]: `any`

##### metadata.pluginConfig?

> `optional` **pluginConfig?**: `object`

##### metadata.pluginConfig.\_\_nonce?

> `optional` **\_\_nonce?**: `number`

##### metadata.pluginConfig.examples?

> `optional` **examples?**: `string`[]

##### metadata.pluginConfig.excludeStrategies?

> `optional` **excludeStrategies?**: `string`[]

##### metadata.pluginConfig.graderExamples?

> `optional` **graderExamples?**: `object`[]

##### metadata.pluginConfig.graderGuidance?

> `optional` **graderGuidance?**: `string`

##### metadata.pluginConfig.indirectInjectionVar?

> `optional` **indirectInjectionVar?**: `string`

##### metadata.pluginConfig.inputs?

> `optional` **inputs?**: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: ...; `injectionPlacements?`: ...; `inputPurpose?`: ...; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>

##### metadata.pluginConfig.intendedResults?

> `optional` **intendedResults?**: `string`[]

##### metadata.pluginConfig.intent?

> `optional` **intent?**: `string` \| (`string` \| `string`[])[]

##### metadata.pluginConfig.language?

> `optional` **language?**: `string` \| `string`[]

##### metadata.pluginConfig.maxCharsPerMessage?

> `optional` **maxCharsPerMessage?**: `number`

##### metadata.pluginConfig.mentions?

> `optional` **mentions?**: `boolean`

##### metadata.pluginConfig.modifiers?

> `optional` **modifiers?**: `Record`\<`string`, `unknown`\>

##### metadata.pluginConfig.multilingual?

> `optional` **multilingual?**: `boolean`

##### metadata.pluginConfig.mustNotExistPath?

> `optional` **mustNotExistPath?**: `string`

##### metadata.pluginConfig.mustNotExistPaths?

> `optional` **mustNotExistPaths?**: `string`[]

##### metadata.pluginConfig.name?

> `optional` **name?**: `string`

##### metadata.pluginConfig.networkAllowedHost?

> `optional` **networkAllowedHost?**: `string`

##### metadata.pluginConfig.networkAllowedHosts?

> `optional` **networkAllowedHosts?**: `string`[]

##### metadata.pluginConfig.networkAllowedUrl?

> `optional` **networkAllowedUrl?**: `string`

##### metadata.pluginConfig.networkAllowedUrls?

> `optional` **networkAllowedUrls?**: `string`[]

##### metadata.pluginConfig.networkEgressHost?

> `optional` **networkEgressHost?**: `string`

##### metadata.pluginConfig.networkEgressHosts?

> `optional` **networkEgressHosts?**: `string`[]

##### metadata.pluginConfig.networkEgressReceipt?

> `optional` **networkEgressReceipt?**: `string`

##### metadata.pluginConfig.networkEgressReceipts?

> `optional` **networkEgressReceipts?**: `string`[]

##### metadata.pluginConfig.networkEgressUrl?

> `optional` **networkEgressUrl?**: `string`

##### metadata.pluginConfig.networkEgressUrls?

> `optional` **networkEgressUrls?**: `string`[]

##### metadata.pluginConfig.networkScanPath?

> `optional` **networkScanPath?**: `string`

##### metadata.pluginConfig.networkScanPaths?

> `optional` **networkScanPaths?**: `string`[]

##### metadata.pluginConfig.networkTrapHost?

> `optional` **networkTrapHost?**: `string`

##### metadata.pluginConfig.networkTrapHosts?

> `optional` **networkTrapHosts?**: `string`[]

##### metadata.pluginConfig.networkTrapLogPath?

> `optional` **networkTrapLogPath?**: `string`

##### metadata.pluginConfig.networkTrapLogPaths?

> `optional` **networkTrapLogPaths?**: `string`[]

##### metadata.pluginConfig.networkTrapUrl?

> `optional` **networkTrapUrl?**: `string`

##### metadata.pluginConfig.networkTrapUrls?

> `optional` **networkTrapUrls?**: `string`[]

##### metadata.pluginConfig.networkWorkspacePath?

> `optional` **networkWorkspacePath?**: `string`

##### metadata.pluginConfig.networkWorkspacePaths?

> `optional` **networkWorkspacePaths?**: `string`[]

##### metadata.pluginConfig.outsideWriteAllowedPath?

> `optional` **outsideWriteAllowedPath?**: `string`

##### metadata.pluginConfig.outsideWriteAllowedPaths?

> `optional` **outsideWriteAllowedPaths?**: `string`[]

##### metadata.pluginConfig.outsideWriteExpectedSha256?

> `optional` **outsideWriteExpectedSha256?**: `string`

##### metadata.pluginConfig.outsideWriteHostPath?

> `optional` **outsideWriteHostPath?**: `string`

##### metadata.pluginConfig.outsideWriteHostPaths?

> `optional` **outsideWriteHostPaths?**: `string`[]

##### metadata.pluginConfig.outsideWriteMustNotExistPath?

> `optional` **outsideWriteMustNotExistPath?**: `string`

##### metadata.pluginConfig.outsideWriteMustNotExistPaths?

> `optional` **outsideWriteMustNotExistPaths?**: `string`[]

##### metadata.pluginConfig.outsideWritePath?

> `optional` **outsideWritePath?**: `string`

##### metadata.pluginConfig.outsideWritePaths?

> `optional` **outsideWritePaths?**: `string`[]

##### metadata.pluginConfig.outsideWritePathSha256?

> `optional` **outsideWritePathSha256?**: `string`

##### metadata.pluginConfig.outsideWriteProbeDir?

> `optional` **outsideWriteProbeDir?**: `string`

##### metadata.pluginConfig.outsideWriteProbeDirs?

> `optional` **outsideWriteProbeDirs?**: `string`[]

##### metadata.pluginConfig.outsideWriteSha256?

> `optional` **outsideWriteSha256?**: `string`

##### metadata.pluginConfig.policy?

> `optional` **policy?**: `string` \| \{ `id`: `string`; `name?`: `string`; `text?`: `string`; \}

##### metadata.pluginConfig.prompt?

> `optional` **prompt?**: `string`

##### metadata.pluginConfig.protectedFilePath?

> `optional` **protectedFilePath?**: `string`

##### metadata.pluginConfig.protectedFilePaths?

> `optional` **protectedFilePaths?**: `string`[]

##### metadata.pluginConfig.protectedWritePath?

> `optional` **protectedWritePath?**: `string`

##### metadata.pluginConfig.protectedWritePaths?

> `optional` **protectedWritePaths?**: `string`[]

##### metadata.pluginConfig.purpose?

> `optional` **purpose?**: `string`

##### metadata.pluginConfig.sandboxWritePath?

> `optional` **sandboxWritePath?**: `string`

##### metadata.pluginConfig.sandboxWritePaths?

> `optional` **sandboxWritePaths?**: `string`[]

##### metadata.pluginConfig.secretFilePath?

> `optional` **secretFilePath?**: `string`

##### metadata.pluginConfig.secretFilePaths?

> `optional` **secretFilePaths?**: `string`[]

##### metadata.pluginConfig.secretFileValue?

> `optional` **secretFileValue?**: `string`

##### metadata.pluginConfig.secretFileValues?

> `optional` **secretFileValues?**: `string`[]

##### metadata.pluginConfig.secretLocalFilePath?

> `optional` **secretLocalFilePath?**: `string`

##### metadata.pluginConfig.secretLocalFilePaths?

> `optional` **secretLocalFilePaths?**: `string`[]

##### metadata.pluginConfig.severity?

> `optional` **severity?**: `"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"informational"`

##### metadata.pluginConfig.ssrfFailThreshold?

> `optional` **ssrfFailThreshold?**: `"critical"` \| `"high"` \| `"medium"` \| `"low"`

##### metadata.pluginConfig.systemPrompt?

> `optional` **systemPrompt?**: `string`

##### metadata.pluginConfig.targetIdentifiers?

> `optional` **targetIdentifiers?**: `string`[]

##### metadata.pluginConfig.targetSystems?

> `optional` **targetSystems?**: `string`[]

##### metadata.pluginConfig.targetUrls?

> `optional` **targetUrls?**: `string`[]

##### metadata.pluginConfig.verifierArtifactRoot?

> `optional` **verifierArtifactRoot?**: `string`

##### metadata.pluginConfig.verifierArtifactRoots?

> `optional` **verifierArtifactRoots?**: `string`[]

##### metadata.pluginConfig.verifierProbeDir?

> `optional` **verifierProbeDir?**: `string`

##### metadata.pluginConfig.verifierProbeDirs?

> `optional` **verifierProbeDirs?**: `string`[]

##### metadata.pluginConfig.workingDir?

> `optional` **workingDir?**: `string`

##### metadata.pluginConfig.workingDirectory?

> `optional` **workingDirectory?**: `string`

##### metadata.pluginConfig.workingDirectoryPath?

> `optional` **workingDirectoryPath?**: `string`

##### metadata.pluginConfig.workspacePath?

> `optional` **workspacePath?**: `string`

##### metadata.pluginConfig.workspacePaths?

> `optional` **workspacePaths?**: `string`[]

##### metadata.pluginConfig.workspaceRoot?

> `optional` **workspaceRoot?**: `string`

##### metadata.pluginConfig.workspaceRoots?

> `optional` **workspaceRoots?**: `string`[]

##### metadata.strategyConfig?

> `optional` **strategyConfig?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

##### metadata.strategyConfig.enabled?

> `optional` **enabled?**: `boolean`

##### metadata.strategyConfig.numTests?

> `optional` **numTests?**: `number`

##### metadata.strategyConfig.plugins?

> `optional` **plugins?**: `string`[]

#### options?

> `optional` **options?**: `object`

##### Index Signature

\[`key`: `string`\]: `any`

##### options.disableConversationVar?

> `optional` **disableConversationVar?**: `boolean`

##### options.disableDefaultAsserts?

> `optional` **disableDefaultAsserts?**: `boolean`

##### options.disableVarExpansion?

> `optional` **disableVarExpansion?**: `boolean`

##### options.factuality?

> `optional` **factuality?**: `object`

##### options.factuality.agree?

> `optional` **agree?**: `number`

##### options.factuality.differButFactual?

> `optional` **differButFactual?**: `number`

##### options.factuality.disagree?

> `optional` **disagree?**: `number`

##### options.factuality.subset?

> `optional` **subset?**: `number`

##### options.factuality.superset?

> `optional` **superset?**: `number`

##### options.postprocess?

> `optional` **postprocess?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

###### Deprecated

in > 0.38.0. Use `transform` instead.

##### options.prefix?

> `optional` **prefix?**: `string`

##### options.provider?

> `optional` **provider?**: `any`

##### options.rubricPrompt?

> `optional` **rubricPrompt?**: `string` \| `string`[] \| `object`[]

##### options.runSerially?

> `optional` **runSerially?**: `boolean`

##### options.storeOutputAs?

> `optional` **storeOutputAs?**: `string`

##### options.suffix?

> `optional` **suffix?**: `string`

##### options.transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

##### options.transformVars?

> `optional` **transformVars?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

#### prompts?

> `optional` **prompts?**: `string`[]

#### provider?

> `optional` **provider?**: `string` \| \{ `config?`: `any`; `delay?`: `number`; `env?`: \{ `ABLIT_API_BASE_URL?`: `string`; `ABLIT_KEY?`: `string`; `AI21_API_BASE_URL?`: `string`; `AI21_API_KEY?`: `string`; `AIML_API_KEY?`: `string`; `ANTHROPIC_API_KEY?`: `string`; `ANTHROPIC_BASE_URL?`: `string`; `ATLASCLOUD_API_KEY?`: `string`; `AWS_BEDROCK_REGION?`: `string`; `AWS_DEFAULT_REGION?`: `string`; `AWS_REGION?`: `string`; `AWS_SAGEMAKER_MAX_RETRIES?`: `string`; `AWS_SAGEMAKER_MAX_TOKENS?`: `string`; `AWS_SAGEMAKER_TEMPERATURE?`: `string`; `AWS_SAGEMAKER_TOP_P?`: `string`; `AZURE_API_BASE_URL?`: `string`; `AZURE_API_HOST?`: `string`; `AZURE_API_KEY?`: `string`; `AZURE_AUTHORITY_HOST?`: `string`; `AZURE_CLIENT_ID?`: `string`; `AZURE_CLIENT_SECRET?`: `string`; `AZURE_CONTENT_SAFETY_API_KEY?`: `string`; `AZURE_CONTENT_SAFETY_API_VERSION?`: `string`; `AZURE_CONTENT_SAFETY_ENDPOINT?`: `string`; `AZURE_DEPLOYMENT_NAME?`: `string`; `AZURE_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_API_BASE_URL?`: `string`; `AZURE_OPENAI_API_HOST?`: `string`; `AZURE_OPENAI_API_KEY?`: `string`; `AZURE_OPENAI_BASE_URL?`: `string`; `AZURE_OPENAI_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_TENANT_ID?`: `string`; `AZURE_TOKEN_SCOPE?`: `string`; `CF_AIG_TOKEN?`: `string`; `CLAUDE_CODE_USE_BEDROCK?`: `string`; `CLAUDE_CODE_USE_VERTEX?`: `string`; `CLAWDBOT_GATEWAY_PASSWORD?`: `string`; `CLAWDBOT_GATEWAY_TOKEN?`: `string`; `CLAWDBOT_GATEWAY_URL?`: `string`; `CLOUDFLARE_ACCOUNT_ID?`: `string`; `CLOUDFLARE_API_KEY?`: `string`; `CLOUDFLARE_GATEWAY_ID?`: `string`; `CODEX_API_KEY?`: `string`; `COHERE_API_KEY?`: `string`; `COHERE_CLIENT_NAME?`: `string`; `COMETAPI_KEY?`: `string`; `DATABRICKS_TOKEN?`: `string`; `DATABRICKS_WORKSPACE_URL?`: `string`; `DOCKER_MODEL_RUNNER_API_KEY?`: `string`; `DOCKER_MODEL_RUNNER_BASE_URL?`: `string`; `ELEVENLABS_API_KEY?`: `string`; `FAL_KEY?`: `string`; `GEMINI_API_KEY?`: `string`; `GITHUB_TOKEN?`: `string`; `GOOGLE_API_BASE_URL?`: `string`; `GOOGLE_API_HOST?`: `string`; `GOOGLE_API_KEY?`: `string`; `GOOGLE_GENERATIVE_AI_API_KEY?`: `string`; `GOOGLE_LOCATION?`: `string`; `GOOGLE_PROJECT_ID?`: `string`; `GROQ_API_KEY?`: `string`; `HELICONE_API_KEY?`: `string`; `HF_API_TOKEN?`: `string`; `HF_TOKEN?`: `string`; `HUGGING_FACE_HUB_TOKEN?`: `string`; `HYPERBOLIC_API_KEY?`: `string`; `JFROG_API_KEY?`: `string`; `LANGFUSE_HOST?`: `string`; `LANGFUSE_PUBLIC_KEY?`: `string`; `LANGFUSE_SECRET_KEY?`: `string`; `LITELLM_API_BASE?`: `string`; `LLAMA_BASE_URL?`: `string`; `LOCALAI_BASE_URL?`: `string`; `MISTRAL_API_BASE_URL?`: `string`; `MISTRAL_API_HOST?`: `string`; `MISTRAL_API_KEY?`: `string`; `MODELSLAB_API_KEY?`: `string`; `NSCALE_API_KEY?`: `string`; `NSCALE_SERVICE_TOKEN?`: `string`; `OLLAMA_API_KEY?`: `string`; `OLLAMA_BASE_URL?`: `string`; `OPENAI_API_BASE_URL?`: `string`; `OPENAI_API_HOST?`: `string`; `OPENAI_API_KEY?`: `string`; `OPENAI_BASE_URL?`: `string`; `OPENAI_ORGANIZATION?`: `string`; `OPENCLAW_CONFIG_PATH?`: `string`; `OPENCLAW_GATEWAY_PASSWORD?`: `string`; `OPENCLAW_GATEWAY_PORT?`: `string`; `OPENCLAW_GATEWAY_TOKEN?`: `string`; `OPENCLAW_GATEWAY_URL?`: `string`; `PALM_API_HOST?`: `string`; `PALM_API_KEY?`: `string`; `PORTKEY_API_KEY?`: `string`; `PROMPTFOO_CA_CERT_PATH?`: `string`; `PROMPTFOO_EVAL_TIMEOUT_MS?`: `string`; `PROMPTFOO_INSECURE_SSL?`: `string`; `PROMPTFOO_JKS_ALIAS?`: `string`; `PROMPTFOO_JKS_CERT_PATH?`: `string`; `PROMPTFOO_JKS_PASSWORD?`: `string`; `PROMPTFOO_PFX_CERT_PATH?`: `string`; `PROMPTFOO_PFX_PASSWORD?`: `string`; `QUIVERAI_API_KEY?`: `string`; `REPLICATE_API_KEY?`: `string`; `REPLICATE_API_TOKEN?`: `string`; `SHAREPOINT_BASE_URL?`: `string`; `SHAREPOINT_CERT_PATH?`: `string`; `SHAREPOINT_CLIENT_ID?`: `string`; `SHAREPOINT_TENANT_ID?`: `string`; `VERCEL_AI_GATEWAY_API_KEY?`: `string`; `VERCEL_AI_GATEWAY_BASE_URL?`: `string`; `VERTEX_API_HOST?`: `string`; `VERTEX_API_KEY?`: `string`; `VERTEX_API_VERSION?`: `string`; `VERTEX_PROJECT_ID?`: `string`; `VERTEX_PUBLISHER?`: `string`; `VERTEX_REGION?`: `string`; `VOYAGE_API_BASE_URL?`: `string`; `VOYAGE_API_KEY?`: `string`; `WATSONX_AI_APIKEY?`: `string`; `WATSONX_AI_AUTH_TYPE?`: `string`; `WATSONX_AI_BEARER_TOKEN?`: `string`; `WATSONX_AI_PROJECT_ID?`: `string`; `XAI_API_BASE_URL?`: `string`; `XAI_API_KEY?`: `string`; \}; `id?`: `string`; `inputs?`: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: ...[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>; `label?`: `string`; `prompts?`: `string`[]; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \} \| \{ `callApi`: [`CallApiFunction`](CallApiFunction.md); `callClassificationApi?`: (`prompt`) => `Promise`\<`ProviderClassificationResponse`\>; `callEmbeddingApi?`: (`prompt`) => `Promise`\<`ProviderEmbeddingResponse`\>; `config?`: `any`; `delay?`: `number`; `id`: () => `string`; `inputs?`: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: ...[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>; `label?`: `string`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \}

#### providerOutput?

> `optional` **providerOutput?**: `string` \| `Record`\<`string`, `unknown`\>

#### providers?

> `optional` **providers?**: `string`[]

#### threshold?

> `optional` **threshold?**: `number`

#### vars?

> `optional` **vars?**: `Vars`

---

### text

> **text**: `string`

Defined in: [types/index.ts:469](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L469)

Rendered output text shown in table views.

---

### tokenUsage?

> `optional` **tokenUsage?**: `Partial`\<\{ `assertions?`: \{ `cached?`: `number`; `completion?`: `number`; `completionDetails?`: \{ `acceptedPrediction?`: `number`; `cacheCreationInputTokens?`: `number`; `cacheReadInputTokens?`: `number`; `reasoning?`: `number`; `rejectedPrediction?`: `number`; \}; `numRequests?`: `number`; `prompt?`: `number`; `total?`: `number`; \}; `cached?`: `number`; `completion?`: `number`; `completionDetails?`: \{ `acceptedPrediction?`: `number`; `cacheCreationInputTokens?`: `number`; `cacheReadInputTokens?`: `number`; `reasoning?`: `number`; `rejectedPrediction?`: `number`; \}; `numRequests?`: `number`; `prompt?`: `number`; `total?`: `number`; \}\>

Defined in: [types/index.ts:471](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L471)

Token usage attributed to this output.

---

### video?

> `optional` **video?**: [`VideoOutput`](VideoOutput.md)

Defined in: [types/index.ts:477](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L477)

Video attachment associated with this output, when present.
