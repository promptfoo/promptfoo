# Security Policy

Promptfoo takes security seriously. We appreciate responsible disclosure and will work with you to address valid issues.

## Security Model

Promptfoo is a developer tool that runs in your environment with your user permissions. It is designed to be **permissive by default**.

Some features intentionally execute user-provided code (custom assertions, providers, transforms, plugins). This code execution is **not sandboxed** and should be treated the same way you would treat running a Node.js script locally.

**Important:** Treat Promptfoo configuration files and any referenced scripts as **trusted code**. Do not run Promptfoo against untrusted configs, prompt packs, or pull requests without isolation.

### Local Web Server

The local web server (`promptfoo view`) is a **single-user development tool** intended for use on your local machine. The web API executes evaluations with the same privileges as the CLI — inputs to the API (including provider configurations, transforms, and assertions) are treated as **trusted code**, equivalent to a local config file. The server is not designed to be exposed to untrusted networks or users.

The server includes **CSRF protection** that uses browser-provided `Sec-Fetch-Site` and `Origin` headers to reject cross-site mutating requests from untrusted origins (e.g., a malicious website attempting to call the local API). This mitigates cross-origin attacks from modern browsers but is not a complete defense in all deployment configurations — non-browser clients and requests without browser headers are allowed through to avoid breaking curl, scripts, and SDKs. Known localhost aliases (`localhost`, `127.0.0.1`, `[::1]`, `local.promptfoo.app`) are treated as equivalent origins.

### Trust Boundaries

**Trusted inputs (treated as code):**

- Promptfoo config files (`promptfooconfig.yaml`, etc.)
- Referenced local scripts and modules
- Custom JS assertions, providers, transforms, and plugins

**Untrusted inputs (must remain data-only):**

- Prompt text, test cases, and fixtures
- Model outputs and grader outputs
- Remote content fetched during evaluation

A vulnerability exists when untrusted inputs can trigger code execution, file access, or network access without explicit configuration.

## Hardening Recommendations

If you run Promptfoo in higher-risk contexts (CI, shared machines, third-party configs):

- Run inside a container or VM with minimal privileges
- Use dedicated, least-privileged API keys
- Avoid placing secrets in prompts, fixtures, or config files
- Restrict network egress when running third-party code
- In CI: do not run Promptfoo with secrets on untrusted PRs (e.g., from forks)
- Do not expose the local web server to untrusted networks or the public internet
- Use a reverse proxy with authentication if you need remote access to the web UI
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

- Untrusted input leading to arbitrary code execution: typically **Critical**
- CSRF bypass enabling arbitrary command execution or file write via the local server: typically **High**
- Secret or credential leakage to unconfigured or attacker-controlled destinations: typically **High**
- Algorithmic DoS in CI pipelines causing significant resource exhaustion: typically **Medium–High**
- Web UI XSS requiring deliberate user interaction (for example, self-XSS): typically **Low** or no CVE (see Scope)

## Embargo and Non-Disclosure

We ask reporters to keep vulnerability details confidential until:

- A fix or mitigation is available, or
- We agree on a disclosure date

If remediation is delayed, we will keep the reporter informed and coordinate a revised disclosure timeline in good faith.

## CVE Policy

We request CVEs through GitHub Security Advisories when appropriate. Final advisory and CVE decisions depend on exploitability, impact, affected deployment model, and CNA policies and availability.

**We usually request a CVE for:**

- Remote code execution from untrusted inputs (prompts, test cases, model outputs)
- CSRF bypass enabling arbitrary command execution or file write on the local server
- Secret or credential leakage to unconfigured or unintended destinations
- Supply chain compromise affecting Promptfoo-published packages, dependencies, or build artifacts

**CVE-eligible (case-by-case):**

- Algorithmic DoS in CI pipelines with significant resource impact
- Web UI XSS with demonstrable impact beyond self-XSS

**We generally do not request a CVE for:**

- Issues in explicitly configured custom code (JS assertions, providers, transforms)
- Local API access issues within the documented trust model
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

- Code execution, file access, or network access triggered by **untrusted data inputs** (prompts, test cases, fixtures, model outputs) without explicit configuration enabling it
- Bypasses of documented restrictions or isolation boundaries
- Unexpected secret exposure or credential leakage to unconfigured destinations
- Path traversal or arbitrary file read/write from data-only inputs
- Vulnerabilities in CLI, config parsing, or web UI affecting confidentiality, integrity, or availability beyond the intended trust model described above
- Algorithmic complexity DoS (crafted input causing hang/crash with modest input size)

**Out of scope:**

- Code execution from **explicitly configured** custom code (JS assertions, providers, transforms, plugins configured in your config file)
- Code execution via **direct local web API access** (e.g., curl, scripts, or the bundled UI) — the local server has the same trust level as the CLI and executes evaluation configurations with user privileges (see [Local Web Server](#local-web-server)). Note: cross-site requests from untrusted websites are blocked by CSRF protection and **are** in scope if the protection is bypassed
- Issues requiring the user to run untrusted configs or scripts with local privileges
- Network requests triggered by content in **user-controlled config files** (test variables, prompts, fixtures defined in your config) — users are responsible for what they put in their own configs
- Third-party dependency issues that don't materially affect Promptfoo's security posture (report upstream)
- Social engineering, phishing, or physical attacks
- Volumetric denial of service

**Examples of out-of-scope reports:**

- "A malicious custom assertion reads `process.env` and posts it to a webhook" → Expected behavior; custom code runs with your permissions
- "A third-party prompt pack includes a transform that runs shell commands" → Expected behavior; don't run untrusted configs
- "The Web UI fetches a URL when a test variable contains a URL" → Expected behavior; users control their own config content
- "The local web API executes provider transforms as code" → Expected behavior; the web API has the same trust model as the CLI

If unsure whether something is in scope, report it anyway.

Thank you for helping keep Promptfoo and its users safe.
