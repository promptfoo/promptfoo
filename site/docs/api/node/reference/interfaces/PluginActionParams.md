[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / PluginActionParams

# Interface: PluginActionParams

Defined in: [redteam/types.ts:219](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L219)

## Properties

### config?

> `optional` **config?**: `object`

Defined in: [redteam/types.ts:225](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L225)

#### \_\_nonce?

> `optional` **\_\_nonce?**: `number`

#### examples?

> `optional` **examples?**: `string`[]

#### excludeStrategies?

> `optional` **excludeStrategies?**: `string`[]

#### graderExamples?

> `optional` **graderExamples?**: `object`[]

#### graderGuidance?

> `optional` **graderGuidance?**: `string`

#### indirectInjectionVar?

> `optional` **indirectInjectionVar?**: `string`

#### inputs?

> `optional` **inputs?**: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: `string`[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>

#### intendedResults?

> `optional` **intendedResults?**: `string`[]

#### intent?

> `optional` **intent?**: `string` \| (`string` \| `string`[])[]

#### language?

> `optional` **language?**: `string` \| `string`[]

#### maxCharsPerMessage?

> `optional` **maxCharsPerMessage?**: `number`

#### mentions?

> `optional` **mentions?**: `boolean`

#### modifiers?

> `optional` **modifiers?**: `Record`\<`string`, `unknown`\>

#### multilingual?

> `optional` **multilingual?**: `boolean`

#### mustNotExistPath?

> `optional` **mustNotExistPath?**: `string`

#### mustNotExistPaths?

> `optional` **mustNotExistPaths?**: `string`[]

#### name?

> `optional` **name?**: `string`

#### networkAllowedHost?

> `optional` **networkAllowedHost?**: `string`

#### networkAllowedHosts?

> `optional` **networkAllowedHosts?**: `string`[]

#### networkAllowedUrl?

> `optional` **networkAllowedUrl?**: `string`

#### networkAllowedUrls?

> `optional` **networkAllowedUrls?**: `string`[]

#### networkEgressHost?

> `optional` **networkEgressHost?**: `string`

#### networkEgressHosts?

> `optional` **networkEgressHosts?**: `string`[]

#### networkEgressReceipt?

> `optional` **networkEgressReceipt?**: `string`

#### networkEgressReceipts?

> `optional` **networkEgressReceipts?**: `string`[]

#### networkEgressUrl?

> `optional` **networkEgressUrl?**: `string`

#### networkEgressUrls?

> `optional` **networkEgressUrls?**: `string`[]

#### networkScanPath?

> `optional` **networkScanPath?**: `string`

#### networkScanPaths?

> `optional` **networkScanPaths?**: `string`[]

#### networkTrapHost?

> `optional` **networkTrapHost?**: `string`

#### networkTrapHosts?

> `optional` **networkTrapHosts?**: `string`[]

#### networkTrapLogPath?

> `optional` **networkTrapLogPath?**: `string`

#### networkTrapLogPaths?

> `optional` **networkTrapLogPaths?**: `string`[]

#### networkTrapUrl?

> `optional` **networkTrapUrl?**: `string`

#### networkTrapUrls?

> `optional` **networkTrapUrls?**: `string`[]

#### networkWorkspacePath?

> `optional` **networkWorkspacePath?**: `string`

#### networkWorkspacePaths?

> `optional` **networkWorkspacePaths?**: `string`[]

#### outsideWriteAllowedPath?

> `optional` **outsideWriteAllowedPath?**: `string`

#### outsideWriteAllowedPaths?

> `optional` **outsideWriteAllowedPaths?**: `string`[]

#### outsideWriteExpectedSha256?

> `optional` **outsideWriteExpectedSha256?**: `string`

#### outsideWriteHostPath?

> `optional` **outsideWriteHostPath?**: `string`

#### outsideWriteHostPaths?

> `optional` **outsideWriteHostPaths?**: `string`[]

#### outsideWriteMustNotExistPath?

> `optional` **outsideWriteMustNotExistPath?**: `string`

#### outsideWriteMustNotExistPaths?

> `optional` **outsideWriteMustNotExistPaths?**: `string`[]

#### outsideWritePath?

> `optional` **outsideWritePath?**: `string`

#### outsideWritePaths?

> `optional` **outsideWritePaths?**: `string`[]

#### outsideWritePathSha256?

> `optional` **outsideWritePathSha256?**: `string`

#### outsideWriteProbeDir?

> `optional` **outsideWriteProbeDir?**: `string`

#### outsideWriteProbeDirs?

> `optional` **outsideWriteProbeDirs?**: `string`[]

#### outsideWriteSha256?

> `optional` **outsideWriteSha256?**: `string`

#### policy?

> `optional` **policy?**: `string` \| \{ `id`: `string`; `name?`: `string`; `text?`: `string`; \}

#### prompt?

> `optional` **prompt?**: `string`

#### protectedFilePath?

> `optional` **protectedFilePath?**: `string`

#### protectedFilePaths?

> `optional` **protectedFilePaths?**: `string`[]

#### protectedWritePath?

> `optional` **protectedWritePath?**: `string`

#### protectedWritePaths?

> `optional` **protectedWritePaths?**: `string`[]

#### purpose?

> `optional` **purpose?**: `string`

#### sandboxWritePath?

> `optional` **sandboxWritePath?**: `string`

#### sandboxWritePaths?

> `optional` **sandboxWritePaths?**: `string`[]

#### secretFilePath?

> `optional` **secretFilePath?**: `string`

#### secretFilePaths?

> `optional` **secretFilePaths?**: `string`[]

#### secretFileValue?

> `optional` **secretFileValue?**: `string`

#### secretFileValues?

> `optional` **secretFileValues?**: `string`[]

#### secretLocalFilePath?

> `optional` **secretLocalFilePath?**: `string`

#### secretLocalFilePaths?

> `optional` **secretLocalFilePaths?**: `string`[]

#### severity?

> `optional` **severity?**: `"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"informational"`

#### ssrfFailThreshold?

> `optional` **ssrfFailThreshold?**: `"critical"` \| `"high"` \| `"medium"` \| `"low"`

#### systemPrompt?

> `optional` **systemPrompt?**: `string`

#### targetIdentifiers?

> `optional` **targetIdentifiers?**: `string`[]

#### targetSystems?

> `optional` **targetSystems?**: `string`[]

#### targetUrls?

> `optional` **targetUrls?**: `string`[]

#### verifierArtifactRoot?

> `optional` **verifierArtifactRoot?**: `string`

#### verifierArtifactRoots?

> `optional` **verifierArtifactRoots?**: `string`[]

#### verifierProbeDir?

> `optional` **verifierProbeDir?**: `string`

#### verifierProbeDirs?

> `optional` **verifierProbeDirs?**: `string`[]

#### workingDir?

> `optional` **workingDir?**: `string`

#### workingDirectory?

> `optional` **workingDirectory?**: `string`

#### workingDirectoryPath?

> `optional` **workingDirectoryPath?**: `string`

#### workspacePath?

> `optional` **workspacePath?**: `string`

#### workspacePaths?

> `optional` **workspacePaths?**: `string`[]

#### workspaceRoot?

> `optional` **workspaceRoot?**: `string`

#### workspaceRoots?

> `optional` **workspaceRoots?**: `string`[]

---

### delayMs

> **delayMs**: `number`

Defined in: [redteam/types.ts:224](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L224)

---

### injectVar

> **injectVar**: `string`

Defined in: [redteam/types.ts:222](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L222)

---

### n

> **n**: `number`

Defined in: [redteam/types.ts:223](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L223)

---

### provider

> **provider**: [`ApiProvider`](ApiProvider.md)

Defined in: [redteam/types.ts:220](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L220)

---

### purpose

> **purpose**: `string`

Defined in: [redteam/types.ts:221](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L221)
