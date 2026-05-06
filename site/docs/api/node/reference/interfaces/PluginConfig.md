---
title: 'Interface: PluginConfig'
description: 'Advanced plugin configuration carried on generated red-team test cases.'
---

## Import

```ts
import type { PluginConfig } from 'promptfoo';
```

Defined in: [redteam/types.ts:279](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L279)

Advanced plugin configuration carried on generated red-team test cases.

Most callers should prefer the higher-level red-team config docs; this type is
exposed here because generated test metadata preserves the resolved plugin
settings.

## Example

```ts
const pluginConfig: PluginConfig = {
  language: 'Spanish',
  severity: 'high',
};
```

## Indexable

> \[`key`: `string`\]: `unknown`

Additional plugin-specific settings preserved for custom integrations.

## Properties

### \_\_nonce?

> `optional` **\_\_nonce?**: `number`

Defined in: [redteam/types.ts:443](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L443)

Nonce used to prevent reuse of cached generated test cases.

---

### examples?

> `optional` **examples?**: `string`[]

Defined in: [redteam/types.ts:281](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L281)

Example inputs used to steer red-team test generation.

---

### excludeStrategies?

> `optional` **excludeStrategies?**: `string`[]

Defined in: [redteam/types.ts:321](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L321)

Strategy ids this plugin should not be combined with.

---

### graderExamples?

> `optional` **graderExamples?**: [`PluginGraderExample`](PluginGraderExample.md)[]

Defined in: [redteam/types.ts:283](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L283)

Example grader outputs used to calibrate plugin-specific grading.

---

### graderGuidance?

> `optional` **graderGuidance?**: `string`

Defined in: [redteam/types.ts:285](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L285)

Additional rubric guidance passed to plugin graders.

---

### indirectInjectionVar?

> `optional` **indirectInjectionVar?**: `string`

Defined in: [redteam/types.ts:311](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L311)

Variable name that receives the indirect prompt-injection payload.

---

### inputs?

> `optional` **inputs?**: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: `string`[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>

Defined in: [redteam/types.ts:439](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L439)

Multi-variable input definitions used while generating test cases.

---

### intendedResults?

> `optional` **intendedResults?**: `string`[]

Defined in: [redteam/types.ts:313](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L313)

Expected retrieval results used by RAG-poisoning plugins.

---

### intent?

> `optional` **intent?**: `string` \| (`string` \| `string`[])[]

Defined in: [redteam/types.ts:315](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L315)

Intent label or labels used by intent-aware plugins.

---

### language?

> `optional` **language?**: `string` \| `string`[]

Defined in: [redteam/types.ts:289](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L289)

Language or languages requested for generated tests.

---

### maxCharsPerMessage?

> `optional` **maxCharsPerMessage?**: `number`

Defined in: [redteam/types.ts:441](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L441)

Maximum generated characters per conversation message.

---

### mentions?

> `optional` **mentions?**: `boolean`

Defined in: [redteam/types.ts:301](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L301)

Whether competitor-oriented plugins may mention the configured competitor names.

---

### modifiers?

> `optional` **modifiers?**: `Record`\<`string`, `unknown`\>

Defined in: [redteam/types.ts:295](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L295)

Plugin-specific behavior modifiers such as tone or style.

---

### multilingual?

> `optional` **multilingual?**: `boolean`

Defined in: [redteam/types.ts:309](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L309)

Whether CyberSecEval-style plugins should generate multilingual probes.

---

### mustNotExistPath?

> `optional` **mustNotExistPath?**: `string`

Defined in: [redteam/types.ts:365](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L365)

Single path that must not exist after the run.

---

### mustNotExistPaths?

> `optional` **mustNotExistPaths?**: `string`[]

Defined in: [redteam/types.ts:367](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L367)

Multiple paths that must not exist after the run.

---

### name?

> `optional` **name?**: `string`

Defined in: [redteam/types.ts:307](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L307)

Subject name used by PII-oriented plugins.

---

### networkAllowedHost?

> `optional` **networkAllowedHost?**: `string`

Defined in: [redteam/types.ts:415](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L415)

Single host explicitly allowed by network-safety fixtures.

---

### networkAllowedHosts?

> `optional` **networkAllowedHosts?**: `string`[]

Defined in: [redteam/types.ts:417](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L417)

Multiple hosts explicitly allowed by network-safety fixtures.

---

### networkAllowedUrl?

> `optional` **networkAllowedUrl?**: `string`

Defined in: [redteam/types.ts:419](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L419)

Single URL explicitly allowed by network-safety fixtures.

---

### networkAllowedUrls?

> `optional` **networkAllowedUrls?**: `string`[]

Defined in: [redteam/types.ts:421](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L421)

Multiple URLs explicitly allowed by network-safety fixtures.

---

### networkEgressHost?

> `optional` **networkEgressHost?**: `string`

Defined in: [redteam/types.ts:407](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L407)

Single host used to detect outbound network egress.

---

### networkEgressHosts?

> `optional` **networkEgressHosts?**: `string`[]

Defined in: [redteam/types.ts:409](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L409)

Multiple hosts used to detect outbound network egress.

---

### networkEgressReceipt?

> `optional` **networkEgressReceipt?**: `string`

Defined in: [redteam/types.ts:435](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L435)

Single receipt string expected from a network-egress fixture.

---

### networkEgressReceipts?

> `optional` **networkEgressReceipts?**: `string`[]

Defined in: [redteam/types.ts:437](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L437)

Multiple receipt strings expected from network-egress fixtures.

---

### networkEgressUrl?

> `optional` **networkEgressUrl?**: `string`

Defined in: [redteam/types.ts:399](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L399)

Single URL used to detect outbound network egress.

---

### networkEgressUrls?

> `optional` **networkEgressUrls?**: `string`[]

Defined in: [redteam/types.ts:401](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L401)

Multiple URLs used to detect outbound network egress.

---

### networkScanPath?

> `optional` **networkScanPath?**: `string`

Defined in: [redteam/types.ts:427](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L427)

Single path scanned for network-safety fixture artifacts.

---

### networkScanPaths?

> `optional` **networkScanPaths?**: `string`[]

Defined in: [redteam/types.ts:429](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L429)

Multiple paths scanned for network-safety fixture artifacts.

---

### networkTrapHost?

> `optional` **networkTrapHost?**: `string`

Defined in: [redteam/types.ts:411](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L411)

Single trap host used by network-safety fixtures.

---

### networkTrapHosts?

> `optional` **networkTrapHosts?**: `string`[]

Defined in: [redteam/types.ts:413](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L413)

Multiple trap hosts used by network-safety fixtures.

---

### networkTrapLogPath?

> `optional` **networkTrapLogPath?**: `string`

Defined in: [redteam/types.ts:423](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L423)

Single trap-log path inspected by network-safety fixtures.

---

### networkTrapLogPaths?

> `optional` **networkTrapLogPaths?**: `string`[]

Defined in: [redteam/types.ts:425](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L425)

Multiple trap-log paths inspected by network-safety fixtures.

---

### networkTrapUrl?

> `optional` **networkTrapUrl?**: `string`

Defined in: [redteam/types.ts:403](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L403)

Single trap URL used by network-safety fixtures.

---

### networkTrapUrls?

> `optional` **networkTrapUrls?**: `string`[]

Defined in: [redteam/types.ts:405](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L405)

Multiple trap URLs used by network-safety fixtures.

---

### networkWorkspacePath?

> `optional` **networkWorkspacePath?**: `string`

Defined in: [redteam/types.ts:431](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L431)

Single workspace path used by network-safety fixtures.

---

### networkWorkspacePaths?

> `optional` **networkWorkspacePaths?**: `string`[]

Defined in: [redteam/types.ts:433](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L433)

Multiple workspace paths used by network-safety fixtures.

---

### outsideWriteAllowedPath?

> `optional` **outsideWriteAllowedPath?**: `string`

Defined in: [redteam/types.ts:351](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L351)

Single outside path that is explicitly allowed to be written.

---

### outsideWriteAllowedPaths?

> `optional` **outsideWriteAllowedPaths?**: `string`[]

Defined in: [redteam/types.ts:353](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L353)

Multiple outside paths that are explicitly allowed to be written.

---

### outsideWriteExpectedSha256?

> `optional` **outsideWriteExpectedSha256?**: `string`

Defined in: [redteam/types.ts:355](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L355)

Expected SHA-256 hash for an outside-write fixture artifact.

---

### outsideWriteHostPath?

> `optional` **outsideWriteHostPath?**: `string`

Defined in: [redteam/types.ts:343](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L343)

Single host path outside the workspace used by write-safety fixtures.

---

### outsideWriteHostPaths?

> `optional` **outsideWriteHostPaths?**: `string`[]

Defined in: [redteam/types.ts:345](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L345)

Multiple host paths outside the workspace used by write-safety fixtures.

---

### outsideWriteMustNotExistPath?

> `optional` **outsideWriteMustNotExistPath?**: `string`

Defined in: [redteam/types.ts:361](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L361)

Single outside path that must remain absent after the run.

---

### outsideWriteMustNotExistPaths?

> `optional` **outsideWriteMustNotExistPaths?**: `string`[]

Defined in: [redteam/types.ts:363](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L363)

Multiple outside paths that must remain absent after the run.

---

### outsideWritePath?

> `optional` **outsideWritePath?**: `string`

Defined in: [redteam/types.ts:339](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L339)

Single path outside the workspace that must not be written.

---

### outsideWritePaths?

> `optional` **outsideWritePaths?**: `string`[]

Defined in: [redteam/types.ts:341](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L341)

Multiple paths outside the workspace that must not be written.

---

### outsideWritePathSha256?

> `optional` **outsideWritePathSha256?**: `string`

Defined in: [redteam/types.ts:357](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L357)

SHA-256 hash of the outside path contents before the run.

---

### outsideWriteProbeDir?

> `optional` **outsideWriteProbeDir?**: `string`

Defined in: [redteam/types.ts:347](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L347)

Single probe directory outside the workspace used by write-safety fixtures.

---

### outsideWriteProbeDirs?

> `optional` **outsideWriteProbeDirs?**: `string`[]

Defined in: [redteam/types.ts:349](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L349)

Multiple probe directories outside the workspace used by write-safety fixtures.

---

### outsideWriteSha256?

> `optional` **outsideWriteSha256?**: `string`

Defined in: [redteam/types.ts:359](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L359)

SHA-256 hash used by outside-write fixture checks.

---

### policy?

> `optional` **policy?**: `Policy`

Defined in: [redteam/types.ts:317](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L317)

Policy text or policy id used by policy-aware plugins.

---

### prompt?

> `optional` **prompt?**: `string`

Defined in: [redteam/types.ts:291](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L291)

Prompt override used by plugins that accept custom generation prompts.

---

### protectedFilePath?

> `optional` **protectedFilePath?**: `string`

Defined in: [redteam/types.ts:323](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L323)

Single protected file path used by coding-agent fixtures.

---

### protectedFilePaths?

> `optional` **protectedFilePaths?**: `string`[]

Defined in: [redteam/types.ts:325](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L325)

Multiple protected file paths used by coding-agent fixtures.

---

### protectedWritePath?

> `optional` **protectedWritePath?**: `string`

Defined in: [redteam/types.ts:369](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L369)

Single protected write target used by fixture checks.

---

### protectedWritePaths?

> `optional` **protectedWritePaths?**: `string`[]

Defined in: [redteam/types.ts:371](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L371)

Multiple protected write targets used by fixture checks.

---

### purpose?

> `optional` **purpose?**: `string`

Defined in: [redteam/types.ts:293](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L293)

System purpose override supplied to plugin generation.

---

### sandboxWritePath?

> `optional` **sandboxWritePath?**: `string`

Defined in: [redteam/types.ts:373](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L373)

Single sandbox path used by fixture checks.

---

### sandboxWritePaths?

> `optional` **sandboxWritePaths?**: `string`[]

Defined in: [redteam/types.ts:375](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L375)

Multiple sandbox paths used by fixture checks.

---

### secretFilePath?

> `optional` **secretFilePath?**: `string`

Defined in: [redteam/types.ts:327](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L327)

Single secret file path used by coding-agent fixtures.

---

### secretFilePaths?

> `optional` **secretFilePaths?**: `string`[]

Defined in: [redteam/types.ts:329](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L329)

Multiple secret file paths used by coding-agent fixtures.

---

### secretFileValue?

> `optional` **secretFileValue?**: `string`

Defined in: [redteam/types.ts:335](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L335)

Single expected secret file value used by coding-agent fixtures.

---

### secretFileValues?

> `optional` **secretFileValues?**: `string`[]

Defined in: [redteam/types.ts:337](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L337)

Multiple expected secret file values used by coding-agent fixtures.

---

### secretLocalFilePath?

> `optional` **secretLocalFilePath?**: `string`

Defined in: [redteam/types.ts:331](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L331)

Single local secret file path used by coding-agent fixtures.

---

### secretLocalFilePaths?

> `optional` **secretLocalFilePaths?**: `string`[]

Defined in: [redteam/types.ts:333](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L333)

Multiple local secret file paths used by coding-agent fixtures.

---

### severity?

> `optional` **severity?**: `Severity`

Defined in: [redteam/types.ts:287](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L287)

Severity override for the generated finding.

---

### ssrfFailThreshold?

> `optional` **ssrfFailThreshold?**: `"critical"` \| `"high"` \| `"medium"` \| `"low"`

Defined in: [redteam/types.ts:305](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L305)

Severity threshold that marks an SSRF probe as failed.

---

### systemPrompt?

> `optional` **systemPrompt?**: `string`

Defined in: [redteam/types.ts:319](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L319)

System prompt supplied to plugins that need the target instructions explicitly.

---

### targetIdentifiers?

> `optional` **targetIdentifiers?**: `string`[]

Defined in: [redteam/types.ts:297](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L297)

Target identifiers used by BOLA-style authorization plugins.

---

### targetSystems?

> `optional` **targetSystems?**: `string`[]

Defined in: [redteam/types.ts:299](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L299)

Target systems used by BFLA-style authorization plugins.

---

### targetUrls?

> `optional` **targetUrls?**: `string`[]

Defined in: [redteam/types.ts:303](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L303)

URLs used by SSRF-oriented plugins as candidate targets.

---

### verifierArtifactRoot?

> `optional` **verifierArtifactRoot?**: `string`

Defined in: [redteam/types.ts:377](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L377)

Single artifact root used by verifier fixtures.

---

### verifierArtifactRoots?

> `optional` **verifierArtifactRoots?**: `string`[]

Defined in: [redteam/types.ts:379](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L379)

Multiple artifact roots used by verifier fixtures.

---

### verifierProbeDir?

> `optional` **verifierProbeDir?**: `string`

Defined in: [redteam/types.ts:381](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L381)

Single verifier probe directory used by fixture checks.

---

### verifierProbeDirs?

> `optional` **verifierProbeDirs?**: `string`[]

Defined in: [redteam/types.ts:383](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L383)

Multiple verifier probe directories used by fixture checks.

---

### workingDir?

> `optional` **workingDir?**: `string`

Defined in: [redteam/types.ts:397](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L397)

Short-form working directory alias supplied to coding-agent fixtures.

---

### workingDirectory?

> `optional` **workingDirectory?**: `string`

Defined in: [redteam/types.ts:393](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L393)

Preferred working directory supplied to coding-agent fixtures.

---

### workingDirectoryPath?

> `optional` **workingDirectoryPath?**: `string`

Defined in: [redteam/types.ts:395](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L395)

Explicit working-directory path supplied to coding-agent fixtures.

---

### workspacePath?

> `optional` **workspacePath?**: `string`

Defined in: [redteam/types.ts:385](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L385)

Single workspace path supplied to coding-agent fixtures.

---

### workspacePaths?

> `optional` **workspacePaths?**: `string`[]

Defined in: [redteam/types.ts:387](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L387)

Multiple workspace paths supplied to coding-agent fixtures.

---

### workspaceRoot?

> `optional` **workspaceRoot?**: `string`

Defined in: [redteam/types.ts:389](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L389)

Single workspace root supplied to coding-agent fixtures.

---

### workspaceRoots?

> `optional` **workspaceRoots?**: `string`[]

Defined in: [redteam/types.ts:391](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L391)

Multiple workspace roots supplied to coding-agent fixtures.
