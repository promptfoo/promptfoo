# Security Policy

Promptfoo takes security seriously. We appreciate responsible disclosure and will work with you to address valid issues.

## Security Model

Promptfoo is a developer tool that runs in your environment with your user permissions. It is designed to be **permissive by default**.

Some features intentionally execute user-provided code (custom assertions, custom or script-based providers, transforms, hooks, plugins, and templates in fields that execute code). This code execution is **not sandboxed** and should be treated the same way you would treat running a Node.js script locally.

**The guiding principle:** Promptfoo OSS is a local eval runner, not a sandbox for adversarial eval content. If you explicitly run a config, or select/configure a provider, model, fixture, dataset, prompt pack, remote resource, model-output feedback loop, template, or field that Promptfoo evaluates as code, the result is your responsibility. Running evals against adversarial providers, models, fixtures, remote content, or model-output feedback loops carries inherent risk — use isolation and scoped credentials (see Hardening Recommendations). A vulnerability exists when behavior bypasses a supported isolation boundary or hardening control, affects Cloud/on-prem tenant isolation, or sends data or secrets to a destination the user did not configure for the selected eval, account, reporting, sharing, hosted-feature, or Cloud path.

**Important:** Treat Promptfoo configuration files and everything they reference or evaluate against as **trusted code and data**. This includes referenced scripts, prompt packs, test fixtures or datasets, configured providers, models, remote content, and model-output feedback loops. Run untrusted configs, scripts, prompt packs, fixtures, datasets, providers, models, remote content, model-output feedback loops, or pull requests only when the run is isolated and secrets are scoped for that run.

### Local Developer Interfaces

Promptfoo includes local developer interfaces such as the web UI (`promptfoo view`), MCP server (`promptfoo mcp`), red team target/provider setup pages, and local helper servers launched for development flows. These interfaces are **single-user development tools** intended for use by trusted users and trusted local clients on your machine. They execute with the same user permissions as the CLI and can read configs, run evals, write outputs, and invoke configured providers.

Direct access to these local interfaces by a trusted local user, trusted local browser, trusted MCP client, `curl`, scripts, SDKs, or other software that can reach the bound host and port is not a security boundary. Inputs to these interfaces (including provider configurations, transforms, assertions, and MCP tool arguments) are treated as **trusted code and data**, equivalent to a local config file or CLI invocation.

These interfaces are not designed to be exposed to untrusted networks or users. If you intentionally expose them remotely, use network restrictions, authentication, or a reverse proxy appropriate for your environment.

The local web server includes **CSRF/origin checks** that use browser-provided `Sec-Fetch-Site` and `Origin` headers to reduce accidental cross-origin requests from modern browsers. These checks are **best-effort hardening** for a local development tool, not a supported security boundary. Non-browser clients and requests without browser headers are allowed through to avoid breaking `curl`, scripts, and SDKs. Known localhost aliases (`localhost`, `127.0.0.1`, `[::1]`, `local.promptfoo.app`) are treated as equivalent origins. Reports that depend on another local webpage, browser extension, local process, another machine on the same network, or same-user client reaching a Promptfoo local interface are generally treated as local-environment risks unless they bypass an explicit authentication or authorization control documented for a remote or multi-user deployment.

The web UI, local helper servers, and MCP server bind address, port, and container or orchestration exposure are operational deployment settings. Promptfoo may provide safer defaults and hardening recommendations, but those defaults are not a multi-user authentication boundary. Serving config, reports, traces, media, generated HTML, or API-key-bearing client configuration through these local interfaces is local developer behavior for clients that can reach the bound host and port.

MCP clients are expected to be trusted clients selected by the user. Project roots and workspace paths supplied to MCP tools, generators, and local helper flows are convenience defaults, not filesystem sandboxes, unless a specific feature documents a hard workspace isolation boundary. File reads or writes requested through trusted MCP tool arguments, local API requests, config values, or CLI options are equivalent to local CLI file access, even when they target paths outside the current project directory. A vulnerability exists when a documented MCP authentication or authorization control is bypassed, or when an MCP tool sends data to a destination that was not configured for that data.

### Trust Boundaries

**Trusted configuration and explicit code execution:**

- Promptfoo config files (`promptfooconfig.yaml`, etc.)
- Configured references to local scripts, modules, prompt packs, test fixtures, and datasets
- **Code-executing fields** — config fields where Promptfoo evaluates the value as code rather than data. These include: custom JS/Python/Ruby assertions, custom or script-based providers, transforms, hooks, session parsers, plugins, and `file://`-backed scripts
- Runtime values interpolated into code-executing fields, such as inline script assertions or transforms

**Trusted eval pipeline:**

- Prompt, provider, assertion, and transform templates configured by the user
- Template output is usually data — for example, a prompt template `Tell me about {{topic}}` produces text sent to a provider. However, template output becomes trusted generated code when the target is a code-executing field — for example, a JavaScript assertion `value: 'output.includes("{{keyword}}")'`
- Built-in assertions, graders, transforms, providers, reports, and their template/rendering steps are part of the configured local eval pipeline for the run
- Report renderers, Markdown/HTML render paths, citations, media previews, CSV/JSON exports, screenshots, and viewer downloads are output formats for the user's eval data, not sanitization or sandbox boundaries

**Runtime data:**

- Prompt text, test case variable values, and fixture or dataset row values
- Model outputs, grader outputs, `_conversation` history, and values saved with `storeOutputAs`
- Remote content fetched during evaluation
- URLs, citation links, media URLs, `data:` URLs, file references, blob references, formulas, markup, and other strings produced by the configured eval pipeline

Built-in eval logic and trusted templates may render, transform, score, store, dereference, export, or send runtime data through prompts, provider requests, graders, assertions, transforms, reports, media/blob handling, and viewer/export features. The eval pipeline may also execute trusted built-in or user-configured code that consumes that runtime data — for example, interpolating model output into a grading prompt as a template variable, rendering stored values through the standard Nunjucks pipeline, passing `_conversation` history through a built-in assertion or grader, rendering Markdown in a local report, exporting CSV cells, or dereferencing a file or blob reference that is part of the configured run. Passing runtime data through the configured template engine and eval pipeline is normal operation and is not a sandbox boundary for adversarial eval content, even when that runtime data contains template syntax, URLs, markup, formulas, or file-like references.

Treat adversarial providers, models, prompt packs, fixtures, datasets, remote content, and model-output feedback loops as untrusted eval content and run them with isolation, least-privileged credentials, and restricted egress.

**Configured destinations:**

In this document, the terms **Promptfoo-hosted feature** and **Cloud-backed feature** refer to the same set: Promptfoo-operated endpoints that the user invokes, enables, signs into, or uses through a Cloud-backed flow (the full list is enumerated below).

A destination is configured for the data and credentials the user directly selected, invoked, signed into, or configured it to receive as part of the eval, reporting, sharing, hosted-feature, account, or Cloud path. Selecting a provider, grader, report, hosted feature, account login, sharing action, Cloud-backed feature, or other eval component for a run counts as configuring that destination for the data and credentials needed by that component in that path.

For example, an HTTP provider URL is configured to receive that provider's rendered request, and a grading provider is configured to receive prompts and runtime data needed by the selected model-graded assertion. A Promptfoo-hosted service endpoint, telemetry path, browser-loaded resource, or unrelated provider is a separate destination unless the user separately chose or configured it for that same eval path and data or credential.

Transport behavior for configured destinations is deployment and hardening configuration. TLS verification, custom certificate authorities, proxy settings, local interception, HTTP agent behavior, and related environment variables are not separate Promptfoo security boundaries unless Promptfoo documents a specific transport-security control for that feature. Default transport posture — including the default TLS verification setting for `fetchWithProxy` and other outbound dispatchers, default proxy and certificate-authority handling, and default HTTP agent behavior — is operational and may favor compatibility with corporate proxies, captive portals, and self-signed CAs. Defaults can change between releases and are not by themselves transport-security controls. Users who require strict transport guarantees should configure them explicitly (for example, set `PROMPTFOO_INSECURE_SSL=false`, point `PROMPTFOO_CA_CERT_PATH` at a trusted bundle, or run Promptfoo behind a transport-enforcing egress proxy). Reports about relaxed or disabled certificate verification are out of scope when Promptfoo sends data only to a destination configured for that path and does not bypass a documented transport-security setting that the user has explicitly configured.

Promptfoo-hosted features are configured for the documented payload of the feature the user invokes, enables, signs into, or uses through a Cloud-backed flow. Examples include remote test generation, remote grading, HTTP provider generation, red team target/provider setup helpers, red team target/provider test requests, sharing, Cloud sync, hosted report viewing, hosted scan upload, telemetry, account/license checks, update checks, and consent tracking. Hosted-feature payloads may include account identifiers, usage metadata, application purpose, config fields, prompts, vars, datasets, provider and model identifiers, provider configuration fields, request/response examples, target URLs, target request headers, bearer tokens or other auth material entered into red team target/provider setup/test forms, target and grader inputs or outputs, conversation history, traces, reports, scan artifacts, media or blob data, and derived artifacts needed to provide the selected feature.

Logging into Promptfoo Cloud configures Promptfoo-operated account, license, consent, telemetry, Cloud sync, hosted storage, sharing, media/blob, and product-control endpoints for their documented purposes. A Cloud-backed feature should document whether it stores, shares, syncs, or transiently processes eval content. Reports about Cloud or hosted-feature data transfer are in scope only when Promptfoo sends data outside the documented payload or bypasses a documented control that applies to that hosted path.

Remote generation, remote grading, Cloud sync, sharing, telemetry, and hosted scan or report features have different data requirements. Hosted test generation may receive the application purpose, plugin/strategy configuration, generated attack context, user email for usage tracking, and any additional data documented for the selected hosted strategy. Hosted multi-turn or agentic attack generation may receive conversation history or target responses when that data is required by the selected strategy and the user has not enabled a documented privacy control that applies to that path. Hosted grading may receive the prompt sent to the target, the target response, grading criteria, and related assertion context. Feature documentation should describe the data sent for each hosted path.

**Supported hardening controls and opt-outs:**

Documented opt-out and disable controls are operational controls for the feature families and data paths they describe. They are not sandbox, firewall, tenant-isolation, or general network-egress security boundaries. A path that does not honor a disable value is usually treated as a product correctness or privacy bug rather than a security-boundary bypass when the data is sent only to a configured provider, Promptfoo-operated endpoint, account endpoint, hosted feature, or Cloud-backed feature for that documented path.

- `PROMPTFOO_DISABLE_TELEMETRY` disables product analytics and session replay within the documented telemetry system. Account, license, consent, update checks, sharing, Cloud sync, hosted report viewing, hosted scan upload, and hosted inference are separate features. Promptfoo may still send control-plane requests needed to authenticate the user, check license status, record consent or opt-out state, or operate an explicitly invoked hosted feature. The opt-out acknowledgment that records that telemetry was disabled may itself include the local user identifier and, when set, the email associated with the local Promptfoo environment, so that opt-out usage can be measured.
- `PROMPTFOO_DISABLE_REMOTE_GENERATION` disables supported Promptfoo-hosted generation/inference fallbacks within its documented scope, including red team target/provider setup helpers that rely on remote generation. It is not a general network egress firewall and does not disable explicitly configured providers, graders, HTTP endpoints, sharing, Cloud sync, account/license requests, telemetry controls, red team target/provider test requests, red team target/provider setup helpers that do not rely on remote generation, or hosted features whose documentation states a separate control.
- `PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION` disables supported Promptfoo-hosted red-team generation paths within its documented scope, including red team target/provider setup helpers that rely on remote generation. It leaves non-red-team hosted generation, red team target/provider test requests, red team target/provider setup helpers that do not rely on remote generation, sharing, telemetry, account, and Cloud-backed controls unchanged.
- Sharing and Cloud-upload controls govern the upload paths described in their documentation. They do not disable local artifacts, explicitly requested share helpers, account/license requests, telemetry controls, or unrelated hosted features unless the documentation says they do.

**Local artifacts and logs:**

Promptfoo stores local artifacts such as logs, cache entries, databases, trace data, media blobs, config snapshots, reports, and exported files under the user's local account. These local artifacts are not external destinations by themselves. For OSS, secret persistence or display that remains confined to the same local user account is generally treated as a hardening or privacy issue rather than a security-boundary bypass. It becomes in scope only when Promptfoo bypasses a documented redaction, exclusion, authentication, authorization, or tenant-isolation control, or uploads, shares, exports, or otherwise exposes that data beyond the same local account, including to other users or tenants.

Local caches, OAuth/token stores, provider response caches, temporary files, debug logs, report databases, and media/blob stores are scoped to the user's local Promptfoo environment. They are not isolation boundaries between different credentials, providers, endpoints, regions, tenants, accounts, evals, projects, or users running under the same local account unless Promptfoo documents such partitioning for a specific feature. Cache keys, token-store keys, and local artifact paths are not guaranteed to include provider identity, endpoint, region, tenant, account, credential, or project identity unless documented. Cache or token reuse, collision, overwrite, or lookup ambiguity within the same local user environment is generally treated as hardening or privacy behavior rather than a security-boundary bypass. Use separate operating-system users, containers, `PROMPTFOO_CONFIG_DIR` values, cache directories, token stores, and credentials when you need isolation between projects, tenants, or accounts.

Shared or Cloud-backed reports may include the snapshot needed to view, reproduce, or inspect the result, including prompts, vars, outputs, traces, metadata, provider configuration fields, media/blob references, scan artifacts, and derived artifacts. Do not put secrets in prompts, datasets, provider config fields, metadata, or other shareable inputs unless that field is documented as redacted. If a field is documented as redacted or excluded, bypassing that redaction or exclusion is in scope.

Report files, Markdown, HTML, CSV, JSON, screenshots, and other exports are generated artifacts from the user's run. They may contain active markup, formulas, links, media, `data:` URLs, or provider-controlled text. Treat exported artifacts as untrusted when opening them in browsers, spreadsheets, terminals, or other tools.

### Contributor, CI, and Automation Tooling

Promptfoo's public repository workflows, example CI snippets, code-scan action configuration, package-manager behavior, local agent/editor automation, and maintainer scripts are developer automation surfaces. They are not a product sandbox for untrusted pull requests, repository files, npm configuration, editor settings, or agent instructions.

Treat pull-request content, repository-local config files, `package.json` scripts, npm configuration, workflow inputs, scanner guidance files, and agent/editor instructions as trusted code whenever a workflow or local automation runs them with secrets or write-capable credentials. Do not run Promptfoo, repository CI, scanners, agent tools, or examples with secrets on untrusted pull requests or third-party repositories unless those jobs are isolated and the credentials are scoped for that run.

Reports about repository automation are generally out of scope unless they affect Promptfoo-published packages, released product behavior, Cloud/on-prem tenant isolation, or a documented product security boundary.

## Hardening Recommendations

If you run Promptfoo in higher-risk contexts (CI, shared machines, third-party configs or prompt packs, adversarial providers or models, model-output feedback loops):

- Run inside a container or VM with minimal privileges
- Use dedicated, least-privileged API keys
- Avoid placing secrets in prompts, fixtures, or config files
- Restrict network egress when running third-party code or adversarial eval content
- Use separate `PROMPTFOO_CONFIG_DIR` values, cache directories, containers, or operating-system users when switching between accounts, tenants, or sensitive projects
- Configure explicit TLS, proxy, and certificate-authority settings when your environment requires transport guarantees beyond Promptfoo defaults
- In CI: do not run Promptfoo with secrets on untrusted PRs (e.g., from forks)
- Do not expose local developer interfaces to untrusted networks or the public internet
- If the host machine is reachable from other devices, bind local developer interfaces (web UI, MCP HTTP transport, helper servers) explicitly to a loopback address rather than relying on the default bind behavior
- Use a reverse proxy with authentication if you need remote access to the web UI or MCP server
- If you need cross-domain access to the local server, set `PROMPTFOO_CSRF_ALLOWED_ORIGINS` to a comma-separated list of trusted origins

## Supported Versions

| Version                               | Supported        |
| ------------------------------------- | ---------------- |
| Latest published release (npm/Docker) | ✅               |
| `main` branch (unreleased fixes)      | ✅ (best effort) |
| Previously published releases         | ❌               |

We do not backport security fixes. Unsupported releases are previously published versions older than the latest published release. If you report an issue against an older release, we may ask you to reproduce it on the latest supported version.

## Reporting a Vulnerability

**Do not** open a public GitHub issue for security reports.

Report privately via:

- **GitHub Security Advisories:** [Report a vulnerability](https://github.com/promptfoo/promptfoo/security/advisories/new) (preferred — this is a secure channel)
- **Email:** security@promptfoo.dev (fallback: support@promptfoo.dev)

Email is not encrypted by default. For sensitive details (exploit code, PoC artifacts), use GitHub Security Advisories or wait until we establish a secure channel.

We will acknowledge your report within **1 business day**.

For safe harbor provisions and full process details, see our [Responsible Disclosure Policy](https://www.promptfoo.dev/responsible-disclosure-policy/).

### What to Include in Your Report

A good report helps us triage and fix issues faster. Please include:

- **Description** of the vulnerability and its security impact
- **Reproduction steps** — minimal config snippet or sequence of actions (redact any real secrets or API keys)
- **Promptfoo version** (`promptfoo --version` or `promptfoo debug`)
- **Environment** — Node.js version, OS, install method (npm, npx, Docker)
- **Affected surface** — CLI, web UI, or library/SDK
- **Model provider** in use, if relevant to the issue
- **Whether you reproduced on the latest supported release** (or `main`) and, if not, why
- **Exact code path** — relevant file/function/line range, if known
- **For browser-origin claims:** a real browser-based PoC. Spoofed `Origin` or `Sec-Fetch-Site` headers from `curl` are not sufficient
- **Why the issue exceeds the documented trust model** in this policy

### Common Triage Outcomes

We may close reports as one of the following:

- **Invalid** — the reported behavior does not reproduce, depends on stale/nonexistent code, or relies on an unrealistic setup
- **Out of scope** — the behavior matches the documented trust model or requires explicitly configured trusted code or eval content
- **Duplicate** — the report is materially the same as an earlier advisory
- **Already fixed** — the issue is valid but no longer affects the latest supported release

## Response Timeline

These are response targets, not service-level guarantees.

- Acknowledgment and initial assessment are measured from report receipt.
- Remediation targets start once we confirm severity.

| Stage                    | Target           |
| ------------------------ | ---------------- |
| Acknowledgment           | 1 business day   |
| Initial assessment       | 5 business days  |
| Fix (Critical, 9.0–10.0) | 14 calendar days |
| Fix (High, 7.0–8.9)      | 30 calendar days |
| Fix (Medium, 4.0–6.9)    | 60 calendar days |
| Fix (Low, 0.1–3.9)       | Best effort      |

Severity is assessed using [CVSS v4.0](https://www.first.org/cvss/v4.0/specification-document), supplemented by Promptfoo's trust model and deployment context. Targets assume we have enough information to reproduce or validate the issue and are not blocked on reporter follow-up or upstream fixes. We may ship mitigations or workarounds before a full fix is available. We may adjust timelines if a fix requires significant architectural changes and **will communicate any material delays**.

**Promptfoo-specific severity considerations (illustrative, not automatic):**

- Code execution that bypasses a supported isolation boundary or hardening control: typically **Critical**
- Secret or credential leakage to destinations not configured to participate in the selected eval, account, reporting, sharing, hosted-feature, or Cloud path: typically **High**
- Bypasses of documented tenant-isolation, authentication, authorization, redaction, or exclusion controls that send data externally: typically **Medium–High**, depending on the data sent
- Algorithmic DoS in CI pipelines causing significant resource exhaustion: typically **Medium–High**
- Sensitive data written only to local logs, cache, token stores, traces, reports, exports, or databases: typically **Low–Medium**, and higher only if the artifact is uploaded, shared, or exposed to another user or tenant outside the documented sharing or Cloud-backed behavior
- Web UI or report XSS requiring deliberate user interaction, local report access, or same-user artifact opening: typically **Low** or no CVE (see Scope)

## Embargo and Non-Disclosure

We ask reporters to keep vulnerability details confidential until:

- A fix or mitigation is available, or
- We agree on a disclosure date

If remediation is delayed, we will keep the reporter informed and coordinate a revised disclosure timeline in good faith.

## CVE Policy

We request CVEs through GitHub Security Advisories when appropriate. Final advisory and CVE decisions depend on exploitability, impact, affected deployment model, and CNA policies and availability.

**We usually request a CVE for:**

- Code execution that bypasses a supported hardening control or isolation boundary outside the documented local eval pipeline
- Bypasses of Cloud/on-prem isolation boundaries
- Secret or credential leakage to destinations not configured to participate in the selected eval, account, reporting, sharing, hosted-feature, or Cloud path
- Bypasses of documented tenant-isolation, authentication, authorization, redaction, or exclusion controls that send secrets, credentials, or sensitive eval data to an external destination
- Supply chain compromise affecting Promptfoo-published packages, dependencies, or build artifacts

**CVE-eligible (case-by-case):**

- Algorithmic DoS in CI pipelines with significant resource impact
- Sensitive data exposure through local artifacts when those artifacts are uploaded, shared, or exposed across users or tenants outside the documented sharing or Cloud-backed behavior
- Web UI XSS with demonstrable impact beyond self-XSS

**We generally do not request a CVE for:**

- Issues in explicitly configured custom code or templates in code-executing fields (e.g., JS/Python assertions, custom providers, transforms, hooks, plugins)
- Adversarial eval content flowing through the configured template engine and eval pipeline (e.g., model output interpolated into grading prompts, `_conversation` history rendered or passed through built-in assertions/graders, variable values rendered through the standard Nunjucks pipeline, or data passed to configured providers)
- Local API, local web UI, local MCP, CORS, CSRF, browser-origin, bind-address, or same-user local access issues within the documented trust model
- Promptfoo-hosted feature requests, account/license/consent checks, telemetry controls, sharing, Cloud sync, hosted report viewing, hosted scan upload, or media/blob uploads that remain within the documented payload and controls for that feature
- Sensitive data present only in local logs, cache, databases, traces, reports, screenshots, OAuth/token stores, temporary files, or exported files generated by the user's own run and confined to the same local user account, unless another supported boundary is crossed or the artifact is uploaded, shared, or exposed across users or tenants outside the documented sharing or Cloud-backed behavior
- Local cache, provider response cache, OAuth/token-store, temporary-file, or artifact namespace reuse, collision, overwrite, or lookup ambiguity between credentials, providers, endpoints, regions, accounts, tenants, projects, or evals within the same local user environment, unless Promptfoo documents the namespace as an isolation boundary for that feature
- TLS verification, certificate-validation, custom-CA, proxy, HTTP agent, or local network interception behavior for configured destinations, unless Promptfoo bypasses a documented transport-security control
- Active content, formulas, links, media, or markup in local reports or exports generated from the user's eval data
- File reads or writes outside the current project directory requested through trusted MCP tool arguments, local API requests, config values, or CLI options, unless a specific feature documents a hard workspace isolation boundary
- Repository CI, examples, maintainer scripts, code-scan configuration, package-manager configuration, or local agent/editor automation unless the issue affects Promptfoo-published packages, released product behavior, Cloud/on-prem tenant isolation, or a documented product security boundary
- Self-XSS requiring the user to paste payloads into their own console or UI
- Quality, UX, or non-security functional bugs

We may still fix issues in the categories above without requesting a CVE; this classification only affects whether we publish a formal advisory.

## Safe Harbor

We consider security research conducted in good faith to be authorized and will not initiate legal action against researchers who:

- Act in good faith and follow this policy
- Avoid privacy violations, data destruction, and service disruption
- Do not access or modify other users' data
- Report vulnerabilities promptly and do not exploit them beyond what is necessary to demonstrate the issue
- Limit testing to Promptfoo-owned assets, or systems and accounts you own or are explicitly authorized to test (do not test third-party services, infrastructure, or other users' accounts)
- Do not perform social engineering, phishing, physical attacks, or volumetric denial-of-service testing

This safe harbor applies to activities conducted under this policy. For the full legal terms, see our [Responsible Disclosure Policy](https://www.promptfoo.dev/responsible-disclosure-policy/). In case of conflict, the Responsible Disclosure Policy governs.

## Coordinated Disclosure

When a fix is released, we will:

1. Publish a [GitHub Security Advisory](https://github.com/promptfoo/promptfoo/security/advisories) with full details
2. Credit the reporter by name (unless anonymity is requested)
3. Document the fix in release notes or the CHANGELOG, as appropriate

## Scope

**In scope:**

- Code execution, file access, network access, or secret exposure that bypasses a supported isolation boundary or hardening control outside the documented local eval pipeline
- Bypasses of documented restrictions or isolation boundaries
- Data, secret, or credential leakage to destinations not configured to participate in the selected eval, account, reporting, sharing, hosted-feature, or Cloud path, or outside the documented payload for that path
- Path traversal or arbitrary file read/write that escapes a documented sandbox, authentication/authorization boundary, Cloud/on-prem tenant boundary, or explicit path restriction that Promptfoo identifies as a security boundary
- Vulnerabilities in CLI, config parsing, or web UI affecting confidentiality, integrity, or availability beyond the intended trust model described above
- Exposure of privileged local developer interfaces only when it bypasses an explicit authentication or authorization control documented for a remote or multi-user deployment
- Bypasses of documented tenant-isolation, authentication, authorization, redaction, or exclusion controls
- Sensitive local artifacts that are uploaded, shared, served to other users, or exposed across Cloud/on-prem tenant boundaries outside the documented sharing or Cloud-backed behavior
- Algorithmic complexity DoS (crafted input causing hang/crash with modest input size)

**Out of scope:**

- Code execution from **explicitly configured** custom code or templates in code-executing fields (e.g., JS/Python assertions, custom providers, transforms, hooks, plugins, `file://`-backed scripts)
- Adversarial eval content flowing through the configured template engine, built-in assertions, graders, providers, transforms, reports, or model-output feedback loops. This includes model outputs, `_conversation` history, grader outputs, fixture values, and stored runtime values rendered or passed through Nunjucks or other configured eval pipeline steps
- Code execution caused by interpolating runtime data into a code-executing field the user configured, such as `value: 'output === "{{expected}}"'` in a JavaScript assertion — use `context.vars.expected` or safe serialization when the value should remain data
- Code execution, data access, report access, CORS, CSRF, browser-origin, bind-address, local helper server, embedded client configuration, or network-reachability issues via **direct local web API access** or **browser access to the OSS local server** (e.g., `curl`, scripts, SDKs, the bundled UI, browser extensions, same-user local processes, another machine on the same network, or malicious webpages reaching `promptfoo view`) — the local server has the same trust level as the CLI and its CSRF/origin checks are best-effort hardening, not a supported security boundary
- Direct access to the MCP server by a trusted local MCP client selected by the user, including tool behavior that is equivalent to running the CLI locally, unless a documented MCP authentication or authorization control is bypassed
- File reads or writes outside the current project directory requested through trusted MCP tool arguments, local API requests, config values, or CLI options. Project roots and workspace paths are convenience defaults, not security boundaries, unless a specific feature documents a hard workspace isolation boundary
- Issues requiring the user to run untrusted configs, scripts, prompt packs, fixtures, datasets, providers, models, remote content, or model-output feedback loops with local privileges, including cases where adversarial model output is rendered or processed by built-in assertions or graders during that local run
- Network requests to URLs, providers, graders, Promptfoo-hosted features, account/license endpoints, telemetry controls, sharing endpoints, Cloud sync, hosted report viewing, hosted scan upload, media/blob upload, or other Promptfoo services that were configured to receive the relevant eval data, account data, artifacts, or credentials
- Reports that treat telemetry, remote-generation, sharing, Cloud-upload, or privacy controls as a general network egress firewall outside the documented scope of the specific control
- Reports that a disable flag or local-only preference was not honored when the request goes only to a configured provider, Promptfoo-operated endpoint, account endpoint, hosted feature, or Cloud-backed feature for the documented path. These are product correctness or privacy issues unless they bypass a documented tenant-isolation, authentication, authorization, redaction, or exclusion control
- TLS, certificate-validation, proxy, or local network interception concerns for a user-configured destination when Promptfoo sends the data only along that configured path and does not bypass a documented transport-security setting
- TLS verification, certificate-validation, custom-CA, proxy, HTTP agent, or local network interception behavior for Promptfoo-hosted feature requests that remain within the documented payload and controls for that feature, unless Promptfoo bypasses a documented transport-security control
- Sensitive data present only in local logs, cache entries, OAuth/token stores, provider response caches, databases, trace files, temporary files, media blobs, screenshots, reports, or exports created by the user's own run and confined to the same local user account, unless a separate supported boundary is crossed, Promptfoo bypasses a documented redaction or exclusion control, or Promptfoo uploads, shares, or exposes that artifact beyond the documented local, sharing, or Cloud-backed behavior
- Local cache, provider response cache, OAuth/token-store, temporary-file, or artifact namespace reuse, collision, overwrite, or lookup ambiguity between credentials, providers, endpoints, regions, accounts, tenants, projects, or evals within the same local user environment, unless Promptfoo documents the namespace as an isolation boundary for that feature
- Active content, formulas, links, media, `data:` URLs, or markup in local reports, shared reports, screenshots, CSV/JSON exports, Markdown/HTML renderers, citations, or viewer downloads generated from the user's eval data
- Shared or Cloud-backed report snapshots containing prompts, vars, outputs, traces, metadata, provider configuration fields, media/blob references, scan artifacts, or derived artifacts, unless Promptfoo bypasses a documented redaction or exclusion for that field
- Repository workflows, example CI snippets, code-scan action configuration, package-manager behavior, local agent/editor automation, maintainer scripts, and other developer automation surfaces unless the issue affects Promptfoo-published packages, released product behavior, Cloud/on-prem tenant isolation, or a documented product security boundary
- Reports based only on spoofed `Origin` or `Sec-Fetch-Site` headers from non-browser clients
- Third-party dependency issues that don't materially affect Promptfoo's security posture (report upstream)
- Social engineering, phishing, or physical attacks
- Volumetric denial of service

**Examples of out-of-scope reports:**

- "A malicious custom assertion reads `process.env` and posts it to a webhook" → Expected behavior; custom code runs with your permissions
- "A third-party prompt pack includes a transform that runs shell commands" → Expected behavior; don't run untrusted configs
- "A third-party model returns template syntax that is rendered or processed by a built-in assertion or grader and appears in a grading prompt" → Expected behavior; the configured eval pipeline processes runtime data as part of normal operation. Run adversarial models with isolation and scoped credentials
- "An HTTP provider fetches a URL produced from a prompt or test variable" → Expected behavior; provider requests are part of the configured eval flow
- "The local web API executes provider transforms as code" → Expected behavior; the web API has the same trust model as the CLI
- "A trusted local MCP client asks Promptfoo to run an eval or inspect a config" → Expected behavior; MCP tools have the same trust model as local CLI invocations unless a documented MCP authentication or authorization control is bypassed
- "An API key, bearer token, prompt, response, or config value appears in a local DB row, cache entry, report, export, or UI view generated by my own run" → Usually a hardening or privacy bug rather than a security-boundary bypass, unless Promptfoo bypassed a documented redaction or exclusion control or the artifact is uploaded, shared, or exposed beyond the documented local, sharing, or Cloud-backed behavior
- "A malicious website can reach the local server if I replay browser headers with `curl`" → Not a valid browser repro, and local-server browser-origin claims are out of scope
- "A browser DNS rebinding or `Host`/`Origin` confusion attack reaches the local web UI or MCP HTTP server" → Local deployment hardening; bind local interfaces explicitly to loopback when the host machine is reachable from other devices
- "A non-browser client on the same network reaches a local API such as `/api/user/login`, `/providers/test`, `/providers/test-session`, or other helper endpoints because the bound port is reachable from other hosts" → Local deployment hardening; the local server has the same trust model as the CLI
- "The local web UI or a provider helper page includes client configuration or API-key-bearing HTML and is reachable by another machine because I exposed the port" → Local deployment hardening; local helper pages have the same trust model as the CLI
- "A trusted MCP client asks Promptfoo to write generated files outside the current project directory" → Expected behavior; MCP tool arguments and workspace paths are trusted local inputs unless a specific feature documents a hard workspace isolation boundary
- "Two configured providers, endpoints, regions, accounts, or credentials can reuse or collide in a local cache or token store" → Expected local-environment behavior unless Promptfoo documents that cache or token namespace as an isolation boundary. Use separate config/cache directories or OS users when isolation is required
- "A configured provider or hosted feature request uses Promptfoo's default TLS, proxy, certificate, or HTTP agent behavior" → Transport hardening concern, not a security-boundary bypass, unless Promptfoo bypassed a documented transport-security control
- "A Promptfoo-hosted generation, red team target/provider setup/test, telemetry, sharing, or Cloud-backed path sends data despite a local-only or disable setting" → Product correctness or privacy issue, not a security-boundary bypass, when the request goes only to a configured provider or Promptfoo-operated hosted feature for that documented path
- "A spreadsheet formula appears in a CSV export generated from my eval output" → Expected artifact behavior; treat exports as untrusted when opening them in other tools
- "A signed-in Cloud workflow uploads a hosted report snapshot or scan artifact described by the feature documentation" → Expected Cloud-backed behavior
- "A repository workflow, scanner, or local agent reads PR-controlled files while running with secrets" → Out of scope unless it affects Promptfoo-published packages, released product behavior, Cloud/on-prem tenant isolation, or a documented product security boundary

If unsure whether something is in scope, report it anyway.

Thank you for helping keep Promptfoo and its users safe.
