---
title: 'Interface: PluginConfig'
description: 'Advanced plugin configuration carried on generated red-team test cases. See supported imports, signatures, fields, examples, and usage details for this symbol.'
sidebar_position: 27
---

## Import

```ts
import type { PluginConfig } from 'promptfoo';
```

Defined in: [src/redteam/types.ts:281](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L281)

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

## Extends

- `output`\<_typeof_ `PluginConfigSchema`\>

## Indexable

> \[`key`: `string`\]: `unknown`

## Properties

### \_\_nonce?

> `optional` **\_\_nonce?**: `number`

Defined in: [src/redteam/types.ts:234](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L234)

Nonce used to prevent reuse of cached generated test cases.

#### Inherited from

`z.infer.__nonce`

---

### examples?

> `optional` **examples?**: `string`[]

Defined in: [src/redteam/types.ts:58](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L58)

Example inputs used to steer red-team test generation.

#### Inherited from

`z.infer.examples`

---

### excludeStrategies?

> `optional` **excludeStrategies?**: `string`[]

Defined in: [src/redteam/types.ts:109](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L109)

Strategy ids this plugin should not be combined with.

#### Inherited from

`z.infer.excludeStrategies`

---

### graderExamples?

> `optional` **graderExamples?**: `object`[]

Defined in: [src/redteam/types.ts:60](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L60)

Example grader outputs used to calibrate plugin-specific grading.

#### output

> **output**: `string`

#### pass

> **pass**: `boolean`

#### reason

> **reason**: `string`

#### score

> **score**: `number`

#### Inherited from

`z.infer.graderExamples`

---

### graderGuidance?

> `optional` **graderGuidance?**: `string`

Defined in: [src/redteam/types.ts:71](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L71)

Additional rubric guidance passed to plugin graders.

#### Inherited from

`z.infer.graderGuidance`

---

### indirectInjectionVar?

> `optional` **indirectInjectionVar?**: `string`

Defined in: [src/redteam/types.ts:99](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L99)

Variable name that receives the indirect prompt-injection payload.

#### Inherited from

`z.infer.indirectInjectionVar`

---

### inputs?

<!-- prettier-ignore -->
> `optional` **inputs?**: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: `string`[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>

Defined in: [src/redteam/types.ts:229](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L229)

Multi-variable input definitions used while generating test cases.

#### Inherited from

`z.infer.inputs`

---

### intendedResults?

> `optional` **intendedResults?**: `string`[]

Defined in: [src/redteam/types.ts:101](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L101)

Expected retrieval results used by RAG-poisoning plugins.

#### Inherited from

`z.infer.intendedResults`

---

### intent?

> `optional` **intent?**: `string` \| (`string` \| `string`[])[]

Defined in: [src/redteam/types.ts:103](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L103)

Intent label or labels used by intent-aware plugins.

#### Inherited from

`z.infer.intent`

---

### language?

> `optional` **language?**: `string` \| `string`[]

Defined in: [src/redteam/types.ts:75](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L75)

Language or languages requested for generated tests.

#### Inherited from

`z.infer.language`

---

### maxCharsPerMessage?

> `optional` **maxCharsPerMessage?**: `number`

Defined in: [src/redteam/types.ts:231](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L231)

Maximum generated characters per conversation message.

#### Inherited from

`z.infer.maxCharsPerMessage`

---

### mentions?

> `optional` **mentions?**: `boolean`

Defined in: [src/redteam/types.ts:88](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L88)

Whether competitor-oriented plugins may mention the configured competitor names.

#### Inherited from

`z.infer.mentions`

---

### modifiers?

<!-- prettier-ignore -->
> `optional` **modifiers?**: `Record`\<`string`, `unknown`\>

Defined in: [src/redteam/types.ts:82](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L82)

Plugin-specific behavior modifiers such as tone or style.

#### Inherited from

`z.infer.modifiers`

---

### multilingual?

> `optional` **multilingual?**: `boolean`

Defined in: [src/redteam/types.ts:96](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L96)

Whether CyberSecEval-style plugins should generate multilingual probes.

#### Inherited from

`z.infer.multilingual`

---

### mustNotExistPath?

> `optional` **mustNotExistPath?**: `string`

Defined in: [src/redteam/types.ts:154](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L154)

Single path that must not exist after the run.

#### Inherited from

`z.infer.mustNotExistPath`

---

### mustNotExistPaths?

> `optional` **mustNotExistPaths?**: `string`[]

Defined in: [src/redteam/types.ts:156](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L156)

Multiple paths that must not exist after the run.

#### Inherited from

`z.infer.mustNotExistPaths`

---

### name?

> `optional` **name?**: `string`

Defined in: [src/redteam/types.ts:94](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L94)

Subject name used by PII-oriented plugins.

#### Inherited from

`z.infer.name`

---

### networkAllowedHost?

> `optional` **networkAllowedHost?**: `string`

Defined in: [src/redteam/types.ts:204](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L204)

Single host explicitly allowed by network-safety fixtures.

#### Inherited from

`z.infer.networkAllowedHost`

---

### networkAllowedHosts?

> `optional` **networkAllowedHosts?**: `string`[]

Defined in: [src/redteam/types.ts:206](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L206)

Multiple hosts explicitly allowed by network-safety fixtures.

#### Inherited from

`z.infer.networkAllowedHosts`

---

### networkAllowedUrl?

> `optional` **networkAllowedUrl?**: `string`

Defined in: [src/redteam/types.ts:208](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L208)

Single URL explicitly allowed by network-safety fixtures.

#### Inherited from

`z.infer.networkAllowedUrl`

---

### networkAllowedUrls?

> `optional` **networkAllowedUrls?**: `string`[]

Defined in: [src/redteam/types.ts:210](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L210)

Multiple URLs explicitly allowed by network-safety fixtures.

#### Inherited from

`z.infer.networkAllowedUrls`

---

### networkEgressHost?

> `optional` **networkEgressHost?**: `string`

Defined in: [src/redteam/types.ts:196](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L196)

Single host used to detect outbound network egress.

#### Inherited from

`z.infer.networkEgressHost`

---

### networkEgressHosts?

> `optional` **networkEgressHosts?**: `string`[]

Defined in: [src/redteam/types.ts:198](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L198)

Multiple hosts used to detect outbound network egress.

#### Inherited from

`z.infer.networkEgressHosts`

---

### networkEgressReceipt?

> `optional` **networkEgressReceipt?**: `string`

Defined in: [src/redteam/types.ts:224](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L224)

Single receipt string expected from a network-egress fixture.

#### Inherited from

`z.infer.networkEgressReceipt`

---

### networkEgressReceipts?

> `optional` **networkEgressReceipts?**: `string`[]

Defined in: [src/redteam/types.ts:226](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L226)

Multiple receipt strings expected from network-egress fixtures.

#### Inherited from

`z.infer.networkEgressReceipts`

---

### networkEgressUrl?

> `optional` **networkEgressUrl?**: `string`

Defined in: [src/redteam/types.ts:188](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L188)

Single URL used to detect outbound network egress.

#### Inherited from

`z.infer.networkEgressUrl`

---

### networkEgressUrls?

> `optional` **networkEgressUrls?**: `string`[]

Defined in: [src/redteam/types.ts:190](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L190)

Multiple URLs used to detect outbound network egress.

#### Inherited from

`z.infer.networkEgressUrls`

---

### networkScanPath?

> `optional` **networkScanPath?**: `string`

Defined in: [src/redteam/types.ts:216](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L216)

Single path scanned for network-safety fixture artifacts.

#### Inherited from

`z.infer.networkScanPath`

---

### networkScanPaths?

> `optional` **networkScanPaths?**: `string`[]

Defined in: [src/redteam/types.ts:218](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L218)

Multiple paths scanned for network-safety fixture artifacts.

#### Inherited from

`z.infer.networkScanPaths`

---

### networkTrapHost?

> `optional` **networkTrapHost?**: `string`

Defined in: [src/redteam/types.ts:200](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L200)

Single trap host used by network-safety fixtures.

#### Inherited from

`z.infer.networkTrapHost`

---

### networkTrapHosts?

> `optional` **networkTrapHosts?**: `string`[]

Defined in: [src/redteam/types.ts:202](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L202)

Multiple trap hosts used by network-safety fixtures.

#### Inherited from

`z.infer.networkTrapHosts`

---

### networkTrapLogPath?

> `optional` **networkTrapLogPath?**: `string`

Defined in: [src/redteam/types.ts:212](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L212)

Single trap-log path inspected by network-safety fixtures.

#### Inherited from

`z.infer.networkTrapLogPath`

---

### networkTrapLogPaths?

> `optional` **networkTrapLogPaths?**: `string`[]

Defined in: [src/redteam/types.ts:214](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L214)

Multiple trap-log paths inspected by network-safety fixtures.

#### Inherited from

`z.infer.networkTrapLogPaths`

---

### networkTrapUrl?

> `optional` **networkTrapUrl?**: `string`

Defined in: [src/redteam/types.ts:192](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L192)

Single trap URL used by network-safety fixtures.

#### Inherited from

`z.infer.networkTrapUrl`

---

### networkTrapUrls?

> `optional` **networkTrapUrls?**: `string`[]

Defined in: [src/redteam/types.ts:194](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L194)

Multiple trap URLs used by network-safety fixtures.

#### Inherited from

`z.infer.networkTrapUrls`

---

### networkWorkspacePath?

> `optional` **networkWorkspacePath?**: `string`

Defined in: [src/redteam/types.ts:220](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L220)

Single workspace path used by network-safety fixtures.

#### Inherited from

`z.infer.networkWorkspacePath`

---

### networkWorkspacePaths?

> `optional` **networkWorkspacePaths?**: `string`[]

Defined in: [src/redteam/types.ts:222](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L222)

Multiple workspace paths used by network-safety fixtures.

#### Inherited from

`z.infer.networkWorkspacePaths`

---

### outsideWriteAllowedPath?

> `optional` **outsideWriteAllowedPath?**: `string`

Defined in: [src/redteam/types.ts:140](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L140)

Single outside path that is explicitly allowed to be written.

#### Inherited from

`z.infer.outsideWriteAllowedPath`

---

### outsideWriteAllowedPaths?

> `optional` **outsideWriteAllowedPaths?**: `string`[]

Defined in: [src/redteam/types.ts:142](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L142)

Multiple outside paths that are explicitly allowed to be written.

#### Inherited from

`z.infer.outsideWriteAllowedPaths`

---

### outsideWriteExpectedSha256?

> `optional` **outsideWriteExpectedSha256?**: `string`

Defined in: [src/redteam/types.ts:144](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L144)

Expected SHA-256 hash for an outside-write fixture artifact.

#### Inherited from

`z.infer.outsideWriteExpectedSha256`

---

### outsideWriteHostPath?

> `optional` **outsideWriteHostPath?**: `string`

Defined in: [src/redteam/types.ts:132](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L132)

Single host path outside the workspace used by write-safety fixtures.

#### Inherited from

`z.infer.outsideWriteHostPath`

---

### outsideWriteHostPaths?

> `optional` **outsideWriteHostPaths?**: `string`[]

Defined in: [src/redteam/types.ts:134](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L134)

Multiple host paths outside the workspace used by write-safety fixtures.

#### Inherited from

`z.infer.outsideWriteHostPaths`

---

### outsideWriteMustNotExistPath?

> `optional` **outsideWriteMustNotExistPath?**: `string`

Defined in: [src/redteam/types.ts:150](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L150)

Single outside path that must remain absent after the run.

#### Inherited from

`z.infer.outsideWriteMustNotExistPath`

---

### outsideWriteMustNotExistPaths?

> `optional` **outsideWriteMustNotExistPaths?**: `string`[]

Defined in: [src/redteam/types.ts:152](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L152)

Multiple outside paths that must remain absent after the run.

#### Inherited from

`z.infer.outsideWriteMustNotExistPaths`

---

### outsideWritePath?

> `optional` **outsideWritePath?**: `string`

Defined in: [src/redteam/types.ts:128](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L128)

Single path outside the workspace that must not be written.

#### Inherited from

`z.infer.outsideWritePath`

---

### outsideWritePaths?

> `optional` **outsideWritePaths?**: `string`[]

Defined in: [src/redteam/types.ts:130](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L130)

Multiple paths outside the workspace that must not be written.

#### Inherited from

`z.infer.outsideWritePaths`

---

### outsideWritePathSha256?

> `optional` **outsideWritePathSha256?**: `string`

Defined in: [src/redteam/types.ts:146](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L146)

SHA-256 hash of the outside path contents before the run.

#### Inherited from

`z.infer.outsideWritePathSha256`

---

### outsideWriteProbeDir?

> `optional` **outsideWriteProbeDir?**: `string`

Defined in: [src/redteam/types.ts:136](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L136)

Single probe directory outside the workspace used by write-safety fixtures.

#### Inherited from

`z.infer.outsideWriteProbeDir`

---

### outsideWriteProbeDirs?

> `optional` **outsideWriteProbeDirs?**: `string`[]

Defined in: [src/redteam/types.ts:138](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L138)

Multiple probe directories outside the workspace used by write-safety fixtures.

#### Inherited from

`z.infer.outsideWriteProbeDirs`

---

### outsideWriteSha256?

> `optional` **outsideWriteSha256?**: `string`

Defined in: [src/redteam/types.ts:148](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L148)

SHA-256 hash used by outside-write fixture checks.

#### Inherited from

`z.infer.outsideWriteSha256`

---

### policy?

> `optional` **policy?**: `string` \| \{ `id`: `string`; `name?`: `string`; `text?`: `string`; \}

Defined in: [src/redteam/types.ts:105](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L105)

Policy text or policy id used by policy-aware plugins.

#### Inherited from

`z.infer.policy`

---

### prompt?

> `optional` **prompt?**: `string`

Defined in: [src/redteam/types.ts:77](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L77)

Prompt override used by plugins that accept custom generation prompts.

#### Inherited from

`z.infer.prompt`

---

### protectedFilePath?

> `optional` **protectedFilePath?**: `string`

Defined in: [src/redteam/types.ts:112](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L112)

Single protected file path used by coding-agent fixtures.

#### Inherited from

`z.infer.protectedFilePath`

---

### protectedFilePaths?

> `optional` **protectedFilePaths?**: `string`[]

Defined in: [src/redteam/types.ts:114](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L114)

Multiple protected file paths used by coding-agent fixtures.

#### Inherited from

`z.infer.protectedFilePaths`

---

### protectedWritePath?

> `optional` **protectedWritePath?**: `string`

Defined in: [src/redteam/types.ts:158](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L158)

Single protected write target used by fixture checks.

#### Inherited from

`z.infer.protectedWritePath`

---

### protectedWritePaths?

> `optional` **protectedWritePaths?**: `string`[]

Defined in: [src/redteam/types.ts:160](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L160)

Multiple protected write targets used by fixture checks.

#### Inherited from

`z.infer.protectedWritePaths`

---

### purpose?

> `optional` **purpose?**: `string`

Defined in: [src/redteam/types.ts:79](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L79)

System purpose override supplied to plugin generation.

#### Inherited from

`z.infer.purpose`

---

### sandboxWritePath?

> `optional` **sandboxWritePath?**: `string`

Defined in: [src/redteam/types.ts:162](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L162)

Single sandbox path used by fixture checks.

#### Inherited from

`z.infer.sandboxWritePath`

---

### sandboxWritePaths?

> `optional` **sandboxWritePaths?**: `string`[]

Defined in: [src/redteam/types.ts:164](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L164)

Multiple sandbox paths used by fixture checks.

#### Inherited from

`z.infer.sandboxWritePaths`

---

### secretFilePath?

> `optional` **secretFilePath?**: `string`

Defined in: [src/redteam/types.ts:116](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L116)

Single secret file path used by coding-agent fixtures.

#### Inherited from

`z.infer.secretFilePath`

---

### secretFilePaths?

> `optional` **secretFilePaths?**: `string`[]

Defined in: [src/redteam/types.ts:118](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L118)

Multiple secret file paths used by coding-agent fixtures.

#### Inherited from

`z.infer.secretFilePaths`

---

### secretFileValue?

> `optional` **secretFileValue?**: `string`

Defined in: [src/redteam/types.ts:124](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L124)

Single expected secret file value used by coding-agent fixtures.

#### Inherited from

`z.infer.secretFileValue`

---

### secretFileValues?

> `optional` **secretFileValues?**: `string`[]

Defined in: [src/redteam/types.ts:126](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L126)

Multiple expected secret file values used by coding-agent fixtures.

#### Inherited from

`z.infer.secretFileValues`

---

### secretLocalFilePath?

> `optional` **secretLocalFilePath?**: `string`

Defined in: [src/redteam/types.ts:120](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L120)

Single local secret file path used by coding-agent fixtures.

#### Inherited from

`z.infer.secretLocalFilePath`

---

### secretLocalFilePaths?

> `optional` **secretLocalFilePaths?**: `string`[]

Defined in: [src/redteam/types.ts:122](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L122)

Multiple local secret file paths used by coding-agent fixtures.

#### Inherited from

`z.infer.secretLocalFilePaths`

---

### severity?

> `optional` **severity?**: `"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"informational"`

Defined in: [src/redteam/types.ts:73](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L73)

Severity override for the generated finding.

#### Inherited from

`z.infer.severity`

---

### ssrfFailThreshold?

> `optional` **ssrfFailThreshold?**: `"critical"` \| `"high"` \| `"medium"` \| `"low"`

Defined in: [src/redteam/types.ts:92](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L92)

Severity threshold that marks an SSRF probe as failed.

#### Inherited from

`z.infer.ssrfFailThreshold`

---

### systemPrompt?

> `optional` **systemPrompt?**: `string`

Defined in: [src/redteam/types.ts:107](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L107)

System prompt supplied to plugins that need the target instructions explicitly.

#### Inherited from

`z.infer.systemPrompt`

---

### targetIdentifiers?

> `optional` **targetIdentifiers?**: `string`[]

Defined in: [src/redteam/types.ts:84](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L84)

Target identifiers used by BOLA-style authorization plugins.

#### Inherited from

`z.infer.targetIdentifiers`

---

### targetSystems?

> `optional` **targetSystems?**: `string`[]

Defined in: [src/redteam/types.ts:86](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L86)

Target systems used by BFLA-style authorization plugins.

#### Inherited from

`z.infer.targetSystems`

---

### targetUrls?

> `optional` **targetUrls?**: `string`[]

Defined in: [src/redteam/types.ts:90](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L90)

URLs used by SSRF-oriented plugins as candidate targets.

#### Inherited from

`z.infer.targetUrls`

---

### verifierArtifactRoot?

> `optional` **verifierArtifactRoot?**: `string`

Defined in: [src/redteam/types.ts:166](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L166)

Single artifact root used by verifier fixtures.

#### Inherited from

`z.infer.verifierArtifactRoot`

---

### verifierArtifactRoots?

> `optional` **verifierArtifactRoots?**: `string`[]

Defined in: [src/redteam/types.ts:168](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L168)

Multiple artifact roots used by verifier fixtures.

#### Inherited from

`z.infer.verifierArtifactRoots`

---

### verifierProbeDir?

> `optional` **verifierProbeDir?**: `string`

Defined in: [src/redteam/types.ts:170](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L170)

Single verifier probe directory used by fixture checks.

#### Inherited from

`z.infer.verifierProbeDir`

---

### verifierProbeDirs?

> `optional` **verifierProbeDirs?**: `string`[]

Defined in: [src/redteam/types.ts:172](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L172)

Multiple verifier probe directories used by fixture checks.

#### Inherited from

`z.infer.verifierProbeDirs`

---

### workingDir?

> `optional` **workingDir?**: `string`

Defined in: [src/redteam/types.ts:186](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L186)

Short-form working directory alias supplied to coding-agent fixtures.

#### Inherited from

`z.infer.workingDir`

---

### workingDirectory?

> `optional` **workingDirectory?**: `string`

Defined in: [src/redteam/types.ts:182](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L182)

Preferred working directory supplied to coding-agent fixtures.

#### Inherited from

`z.infer.workingDirectory`

---

### workingDirectoryPath?

> `optional` **workingDirectoryPath?**: `string`

Defined in: [src/redteam/types.ts:184](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L184)

Explicit working-directory path supplied to coding-agent fixtures.

#### Inherited from

`z.infer.workingDirectoryPath`

---

### workspacePath?

> `optional` **workspacePath?**: `string`

Defined in: [src/redteam/types.ts:174](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L174)

Single workspace path supplied to coding-agent fixtures.

#### Inherited from

`z.infer.workspacePath`

---

### workspacePaths?

> `optional` **workspacePaths?**: `string`[]

Defined in: [src/redteam/types.ts:176](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L176)

Multiple workspace paths supplied to coding-agent fixtures.

#### Inherited from

`z.infer.workspacePaths`

---

### workspaceRoot?

> `optional` **workspaceRoot?**: `string`

Defined in: [src/redteam/types.ts:178](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L178)

Single workspace root supplied to coding-agent fixtures.

#### Inherited from

`z.infer.workspaceRoot`

---

### workspaceRoots?

> `optional` **workspaceRoots?**: `string`[]

Defined in: [src/redteam/types.ts:180](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L180)

Multiple workspace roots supplied to coding-agent fixtures.

#### Inherited from

`z.infer.workspaceRoots`
