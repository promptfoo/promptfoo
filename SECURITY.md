# Security Policy

Promptfoo takes security seriously. We appreciate responsible disclosure and will work with you to address valid issues.

## Security Model

Promptfoo is a developer tool that runs in your environment with your user permissions. It is designed to be **permissive by default**.

Some features intentionally execute user-provided code (custom assertions, custom or script-based providers, transforms, hooks, plugins, and templates in fields that execute code). This code execution is **not sandboxed** and should be treated the same way you would treat running a Node.js script locally.

**The guiding principle:** Promptfoo OSS is a local eval runner, not a sandbox for adversarial eval content. If you explicitly run a config, or select/configure a provider, model, fixture, dataset, prompt pack, remote resource, model-output feedback loop, template, or field that Promptfoo evaluates as code, the result is your responsibility. Running evals against adversarial providers, models, fixtures, remote content, or model-output feedback loops carries inherent risk — use isolation and scoped credentials (see Hardening Recommendations). A vulnerability exists when behavior bypasses a supported isolation boundary or hardening control, affects Cloud/on-prem tenant isolation, or sends data or secrets to a destination the user did not configure to participate in that eval.

**Important:** Treat Promptfoo configuration files and everything they reference or evaluate against as **trusted code and data**. This includes referenced scripts, prompt packs, test fixtures or datasets, configured providers, models, remote content, and model-output feedback loops. Run untrusted configs, scripts, prompt packs, fixtures, datasets, providers, models, remote content, model-output feedback loops, or pull requests only when the run is isolated and secrets are scoped for that run.

### Local Developer Interfaces

Promptfoo includes local developer interfaces such as the web UI (`promptfoo view`) and MCP server (`promptfoo mcp`). These interfaces are **single-user development tools** intended for use by trusted users and trusted local clients on your machine. They execute with the same user permissions as the CLI and can read configs, run evals, write outputs, and invoke configured providers.

Direct access to these local interfaces by a trusted local user, trusted local browser, trusted MCP client, `curl`, scripts, or SDKs is not a security boundary. Inputs to these interfaces (including provider configurations, transforms, assertions, and MCP tool arguments) are treated as **trusted code and data**, equivalent to a local config file or CLI invocation.

These interfaces are not designed to be exposed to untrusted networks or users. If you intentionally expose them remotely, use network restrictions, authentication, or a reverse proxy appropriate for your environment.

The local web server includes **CSRF/origin checks** that use browser-provided `Sec-Fetch-Site` and `Origin` headers to reduce accidental cross-origin requests from modern browsers. These checks are **best-effort hardening** for a local development tool, not a supported security boundary. Non-browser clients and requests without browser headers are allowed through to avoid breaking `curl`, scripts, and SDKs. Known localhost aliases (`localhost`, `127.0.0.1`, `[::1]`, `local.promptfoo.app`) are treated as equivalent origins.

The MCP server should bind to loopback by default for HTTP transports. MCP clients are expected to be trusted clients selected by the user. A vulnerability exists when the default MCP configuration exposes privileged tools beyond loopback without an explicit user choice, when a documented MCP hardening control is bypassed, or when an MCP tool sends data to a destination that was not configured for that data.

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

**Runtime data:**

- Prompt text, test case variable values, and fixture or dataset row values
- Model outputs, grader outputs, `_conversation` history, and values saved with `storeOutputAs`
- Remote content fetched during evaluation

Built-in eval logic and trusted templates may render, transform, score, store, or send runtime data through prompts, provider requests, graders, assertions, transforms, and reports. The eval pipeline may also execute trusted built-in or user-configured code that consumes that runtime data — for example, interpolating model output into a grading prompt as a template variable, rendering stored values through the standard Nunjucks pipeline, or passing `_conversation` history through a built-in assertion or grader. Passing runtime data through the configured template engine and eval pipeline is normal operation and is not a sandbox boundary for adversarial eval content, even when that runtime data contains template syntax.

Treat adversarial providers, models, prompt packs, fixtures, datasets, remote content, and model-output feedback loops as untrusted eval content and run them with isolation, least-privileged credentials, and restricted egress.

**Configured destinations:**

A destination is configured only for the data and credentials the user directly selected or configured it to receive as part of the eval path. Selecting a provider, grader, report, hosted feature, or other eval component for a run counts as configuring that destination for the data and credentials needed by that component in that eval path.

For example, an HTTP provider URL is configured to receive that provider's rendered request, and a grading provider is configured to receive prompts and runtime data needed by the selected model-graded assertion. A Promptfoo-hosted service endpoint, telemetry path, browser-loaded resource, or unrelated provider is a separate destination unless the user separately chose or configured it for that same eval path and data or credential.

Promptfoo-hosted features are configured only for the documented payload of the specific feature the user invokes or enables. Examples include remote test generation, remote grading, HTTP provider generation, sharing, Cloud sync, telemetry, account/license checks, and consent tracking. Invoking one hosted feature does not configure unrelated hosted destinations for the same data. For example, logging into Promptfoo Cloud configures account and license endpoints; it does not by itself configure telemetry, session replay, sharing, or Cloud media upload to receive eval content.

Remote generation and remote grading have different data requirements. Hosted test generation may receive the application purpose, plugin/strategy configuration, generated attack context, user email for usage tracking, and any additional data documented for the selected hosted strategy. Hosted multi-turn or agentic attack generation may receive conversation history or target responses when that data is required by the selected strategy and the user has not enabled a privacy control that excludes target outputs. Hosted grading may receive the prompt sent to the target, the target response, grading criteria, and related assertion context. Feature documentation should describe the data sent for each hosted path.

**Supported hardening controls and opt-outs:**

Documented opt-out and disable controls are supported hardening controls. When a user sets a documented disable value such as `1`, `true`, or `yes`, Promptfoo should fail closed for the disabled behavior.

- `PROMPTFOO_DISABLE_TELEMETRY` disables product analytics, telemetry events, and session replay. Account, license, consent, update checks, sharing, and hosted inference are separate features and must be documented separately.
- `PROMPTFOO_DISABLE_REMOTE_GENERATION` disables Promptfoo-hosted generation/inference fallbacks, including red-team hosted generation, unless the user explicitly configures a different destination and the relevant documentation states how the controls interact.
- `PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION` disables Promptfoo-hosted red-team generation paths while leaving non-red-team hosted generation controls unchanged.
- Sharing and Cloud-upload controls govern eval result, trace, and media uploads. Cloud login alone should not be treated as consent to upload eval content unless the relevant Cloud feature clearly documents that behavior and provides an opt-out.

**Local artifacts and logs:**

Promptfoo stores local artifacts such as logs, cache entries, databases, trace data, media blobs, config snapshots, reports, and exported files under the user's local account. These local artifacts are not external destinations by themselves. For OSS, secret persistence or display that remains confined to the same local user account is generally treated as a hardening or privacy issue rather than a security-boundary bypass. It becomes in scope only when Promptfoo bypasses a documented redaction or disable/opt-out control, or uploads, shares, exports, or otherwise exposes that data beyond the same local account, including to other users or tenants.

## Hardening Recommendations

If you run Promptfoo in higher-risk contexts (CI, shared machines, third-party configs or prompt packs, adversarial providers or models, model-output feedback loops):

- Run inside a container or VM with minimal privileges
- Use dedicated, least-privileged API keys
- Avoid placing secrets in prompts, fixtures, or config files
- Restrict network egress when running third-party code or adversarial eval content
- In CI: do not run Promptfoo with secrets on untrusted PRs (e.g., from forks)
- Do not expose local developer interfaces to untrusted networks or the public internet
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
- Secret or credential leakage to destinations not configured to participate in the selected eval path: typically **High**
- Bypasses of documented privacy, telemetry, sharing, or remote-generation opt-outs that send data externally: typically **Medium–High**, depending on the data sent
- Algorithmic DoS in CI pipelines causing significant resource exhaustion: typically **Medium–High**
- Sensitive data written only to local logs, cache, traces, reports, or databases: typically **Low–Medium**, and higher if the artifact is uploaded, shared, exported, or exposed to another user or tenant
- Web UI XSS requiring deliberate user interaction (for example, self-XSS): typically **Low** or no CVE (see Scope)

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
- Secret or credential leakage to destinations not configured to participate in the selected eval path
- Bypasses of documented opt-out controls that send secrets, credentials, or sensitive eval data to an external destination
- Supply chain compromise affecting Promptfoo-published packages, dependencies, or build artifacts

**CVE-eligible (case-by-case):**

- Algorithmic DoS in CI pipelines with significant resource impact
- Sensitive data exposure through local artifacts when those artifacts are uploaded, shared, exported, or exposed across users or tenants
- Web UI XSS with demonstrable impact beyond self-XSS

**We generally do not request a CVE for:**

- Issues in explicitly configured custom code or templates in code-executing fields (e.g., JS/Python assertions, custom providers, transforms, hooks, plugins)
- Adversarial eval content flowing through the configured template engine and eval pipeline (e.g., model output interpolated into grading prompts, `_conversation` history rendered or passed through built-in assertions/graders, variable values rendered through the standard Nunjucks pipeline, or data passed to configured providers)
- Local API access issues within the documented trust model
- Sensitive data present only in local logs, cache, databases, traces, reports, screenshots, or exported files generated by the user's own run and confined to the same local user account, unless another supported boundary is crossed or the artifact is uploaded, shared, exported, or exposed across users or tenants
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
- Data, secret, or credential leakage to destinations not configured to participate in the selected eval path
- Path traversal or arbitrary file read/write that escapes the configured eval flow, documented file access behavior, or supported path restrictions
- Vulnerabilities in CLI, config parsing, or web UI affecting confidentiality, integrity, or availability beyond the intended trust model described above
- Default exposure of privileged local developer interfaces to untrusted networks, or bypasses of documented local-interface hardening controls
- Bypasses of documented telemetry, remote-generation, sharing, Cloud-upload, or privacy opt-outs
- Sensitive local artifacts that are uploaded, shared, exported, served to other users, or exposed across Cloud/on-prem tenant boundaries without the user's explicit action
- Algorithmic complexity DoS (crafted input causing hang/crash with modest input size)

**Out of scope:**

- Code execution from **explicitly configured** custom code or templates in code-executing fields (e.g., JS/Python assertions, custom providers, transforms, hooks, plugins, `file://`-backed scripts)
- Adversarial eval content flowing through the configured template engine, built-in assertions, graders, providers, transforms, reports, or model-output feedback loops. This includes model outputs, `_conversation` history, grader outputs, fixture values, and stored runtime values rendered or passed through Nunjucks or other configured eval pipeline steps
- Code execution caused by interpolating runtime data into a code-executing field the user configured, such as `value: 'output === "{{expected}}"'` in a JavaScript assertion — use `context.vars.expected` or safe serialization when the value should remain data
- Code execution via **direct local web API access** or **browser access to the OSS local server** (e.g., `curl`, scripts, SDKs, the bundled UI, or malicious webpages reaching `promptfoo view`) — the local server has the same trust level as the CLI and its CSRF/origin checks are best-effort hardening, not a supported security boundary
- Direct access to the MCP server by a trusted local MCP client selected by the user, including tool behavior that is equivalent to running the CLI locally
- Issues requiring the user to run untrusted configs, scripts, prompt packs, fixtures, datasets, providers, models, remote content, or model-output feedback loops with local privileges, including cases where adversarial model output is rendered or processed by built-in assertions or graders during that local run
- Network requests to URLs, providers, graders, or Promptfoo services that were configured to receive the relevant eval data or credentials
- Sensitive data present only in local logs, cache entries, databases, trace files, media blobs, screenshots, reports, or exports created by the user's own run and confined to the same local user account, unless a separate supported boundary is crossed, Promptfoo bypasses a documented redaction or disable/opt-out control, or Promptfoo uploads, shares, exports, or otherwise exposes that artifact beyond the same account
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
- "A trusted local MCP client asks Promptfoo to run an eval or inspect a config" → Expected behavior; MCP tools have the same trust model as local CLI invocations unless a documented MCP hardening control is bypassed
- "An API key, bearer token, prompt, response, or config value appears in a local DB row, cache entry, report, export, or UI view generated by my own run" → Usually a hardening or privacy bug rather than a security-boundary bypass, unless Promptfoo bypassed a documented redaction or disable/opt-out control or the artifact is uploaded, shared, exported, or exposed beyond the same account
- "A malicious website can reach the local server if I replay browser headers with `curl`" → Not a valid browser repro, and local-server browser-origin claims are out of scope

If unsure whether something is in scope, report it anyway.

Thank you for helping keep Promptfoo and its users safe.
