# Scoped cloud SDK credentials

Evaluations pass credentials to SDK clients without copying the evaluation environment into `process.env`. Environment files, suites and providers follow the existing per-key precedence. An undefined value inherits the lower layer. An empty string can mask a host value. YAML numbers and booleans become strings at the SDK boundary.

## Client and cache lifetimes

A provider owns separate SDK clients for each environment and evaluation resource lifetime. The provider registry releases them after their last physical call, even when evaluation times out before construction completes. Nested evaluations share resource ownership. SageMaker creates one client per region. Standalone callers and callers that inject a client retain ownership.

Cache keys use public selectors and credential-file revision metadata where possible. Rotate files **between evaluations**. A client keeps its initial cache identity and follows the SDK refresh schedule. Files with unchanged metadata count as the same revision.

For secret inputs, the response cache uses a random ID. These include AWS key tuples, Bedrock bearer tokens and custom endpoints, credential-process inputs, Vertex Express keys and scoped Foundry identities. A process-local lookup derived with HKDF maps each input to its ID. It retains up to 256 entries in memory. The disk key contains neither the input nor its derived lookup. Eviction or process restart can cause a cache miss. Upgrading invalidates earlier Bedrock entries for configured keys, bearer tokens, endpoints and profiles.

SageMaker and Vertex use new cache keys because earlier entries could cross credential or project boundaries. SageMaker bypasses sharing for configured credentials, profiles and injected clients. Vertex bypasses sharing for explicit SDK auth or custom headers, except the service-tier header included in the Gemini request key. Vertex partitions eligible requests by project, region, ADC, quota project and the Express API key.

## AWS

- Explicit key pairs win over Bedrock bearer tokens. Bedrock completion and Converse use a new cache namespace for configured IAM pairs because an older handler could sign with a bearer token and cache under the key pair. An explicitly cleared environment bearer cannot restore the host token.
- Agents and Knowledge Bases bypass shared caching after configured credentials or an explicit credential provider are selected. The Knowledge Base handler preserves an explicit key-pair signature and ignores provider-only bearer overrides.
- Nova Reel and Luma retain SDK bearer precedence. Start, poll and S3 clients receive scoped IAM and file selections. A configured or effective environment bearer bypasses the configured SSO profile. [Nova Sonic requires SigV4](https://docs.aws.amazon.com/bedrock/latest/userguide/models-api-compatibility.html).
- Without overrides the SDK discovers ambient credentials. A cleared profile selects effective keys, then the default file profile. Partial or masked key pairs can fall through to files without restoring cleared host keys. Blank shared filenames select the standard home files.
- `config.profile` selects SSO credentials. The effective `AWS_PROFILE` and shared files also control endpoint URLs, FIPS and dual-stack settings. Nested STS, SSO and OIDC requests receive their own service settings. The outer provider endpoint is never forwarded to STS.

Profiles may use an environment source, web identity, SSO or a credential process. A process receives the invocation environment only in the child. Any override beyond public file and profile selectors can affect process output, so it also partitions the cache when process discovery is possible. Missing sources fall through in SDK order. Terminal authentication errors stop discovery.

Refresh keeps the invocation overrides and rereads inherited host keys. Unexpired credentials remain available during background refresh. Expired credentials and forced refreshes require a successful refresh. A late background result cannot replace a newer forced refresh.

When upgrading the optional AWS SDK, run the profile-chain, endpoint and refresh tests. The adapters resolve package entry points through the installed client. They depend on SDK provider order, the refresh predicate, the `memoized` marker and some exports marked internal.

## Azure

Explicit Foundry service principals bypass shared caching. Other scoped identities partition by the effective authority, selector, principal, credentials and file revisions. Client secret and certificate credentials precede username/password and workload identity. The host-level `AZURE_TOKEN_CREDENTIALS` selector remains SDK-controlled.

Scoped workload identity binds both the initial credential and the managed identity token-exchange retry to the selected file and principal. A guarded Azure Identity 4 adapter copies the private `_sources` array to preserve developer and Broker fallback order. Unknown layouts fail closed. Recheck the selector, construction and token-request tests when upgrading Azure Identity.

An invalid scoped credential can fall through when the SDK considers it unavailable. A fatal token error stops the chain. If an explicit clear would restore a host credential, remove the host setting or supply a complete scoped identity.

## Google

Explicit API keys, credential JSON, key files and injected clients retain their precedence. Application Default Credentials (ADC) use the selected file, project and quota project. A caller-owned auth client retains its quota project.

A blank ADC filename permits discovery only if there is no host filename to restore. A masked host project can use an unmasked alias, a configured project or the selected file's project. Supply an explicit project or remove the host setting to allow other discovery sources.
