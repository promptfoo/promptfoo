---
description: Report security vulnerabilities in Promptfoo responsibly - guidelines for disclosure, safe harbor provisions, and response times
---

# Responsible Vulnerability Disclosure Policy

Promptfoo values the security and privacy of our users, customers, and the broader community. We welcome responsible disclosure of vulnerabilities.

## Scope

This policy covers vulnerabilities in:

- **Promptfoo Open Source Software** (CLI, libraries)
- **Promptfoo Cloud Services**
- **Promptfoo On-premises Components**

For technical details on our security model, trust boundaries, and hardening recommendations, see [SECURITY.md](https://github.com/promptfoo/promptfoo/blob/main/SECURITY.md) on GitHub.

### Open Source (CLI)

The OSS CLI runs in your environment with your user permissions. It is **permissive by default** and executes user-configured code (custom assertions, custom or script-based providers, transforms, hooks, plugins, and templates in fields that execute code) without sandboxing.

Treat Promptfoo configuration files and everything they reference or evaluate against as trusted code and data. This includes referenced scripts, prompt packs, test fixtures or datasets, configured providers, models, remote content, and model-output feedback loops. Run untrusted configs, scripts, prompt packs, fixtures, datasets, providers, models, remote content, model-output feedback loops, or pull requests only when the run is isolated and secrets are scoped for that run.

Promptfoo OSS is a local eval runner, not a sandbox for adversarial eval content. Adversarial data flowing through the configured template engine and eval pipeline (e.g., model output in grading prompts, variable values rendered through Nunjucks) is normal operation. However, if a code path outside the configured template engine or user-configured code-executing fields promotes runtime data to code, that is a vulnerability.

**In scope for OSS:** runtime data executed as code outside the configured template engine and code-executing fields; bypasses of documented isolation, access, or sharing controls; and data or credentials sent somewhere the user did not configure.

**Out of scope for OSS:** adversarial eval content flowing through the configured template engine and eval pipeline; code execution from explicitly configured custom code or templates in fields that execute code; direct local API or browser access to the OSS local server (`promptfoo view`); and issues requiring users to run untrusted configs, scripts, prompt packs, fixtures, datasets, providers, models, remote content, or model-output feedback loops with local privileges.

Code Scan does not sandbox repositories or guarantee complete findings. See the [repository security policy](https://github.com/promptfoo/promptfoo/blob/main/SECURITY.md#contributor-ci-and-automation-tooling) for report scope.

When you share an eval, Promptfoo sends its snapshot to your Cloud organization, on-premises deployment, or configured self-hosted endpoint. Your account or config may also enable automatic sharing. A snapshot can include prompts, test vars, model outputs, grading results, traces, configuration, and media.

Saved `PROMPTFOO_STRIP_*` settings remove their documented fields from eval results, exports, and shared snapshots, including shared traces. They do not disable sharing or redact arbitrary content in other fields. Failures of documented redactions or exclusions remain in scope.

Sharing remains in scope if it bypasses a documented control, reaches the wrong destination, exposes another tenant's data, or includes fields or credentials the feature promises to protect. Data confined to your local account is a hardening or privacy issue unless a promised security or redaction control fails.

### Cloud Services

Promptfoo Cloud operates with higher isolation expectations. The following are **in scope and treated as critical**:

- Cross-tenant data access or isolation failures
- Sandbox escapes or privilege escalation
- Access to Promptfoo internal systems or credentials
- Unauthorized data exposure between accounts

## Reporting Vulnerabilities

**Do not** open a public GitHub issue for security reports.

Report privately via:

- **GitHub Security Advisories:** "Report a vulnerability" button (preferred)
- **Email:** security@promptfoo.dev (fallback: support@promptfoo.dev)

Include:

- Description and steps to reproduce
- Affected version or environment
- Security impact assessment
- Whether remotely exploitable or requires local access
- Your contact info for follow-up (optional)

To speed triage, also include:

- Whether you reproduced on the latest supported release (or `main`)
- The affected file/function/code path, if known
- A real browser-based PoC for browser-origin claims; spoofed `Origin` or `Sec-Fetch-Site` headers from `curl` or other non-browser clients are not sufficient
- Why the issue exceeds the OSS trust model described in [SECURITY.md](https://github.com/promptfoo/promptfoo/blob/main/SECURITY.md)

## Response Time

We will acknowledge your report within **1 business day** and keep you informed throughout remediation.

## Responsible Disclosure Guidelines

When researching or disclosing vulnerabilities:

- Do not exploit beyond minimal testing needed to demonstrate the issue
- Do not disclose publicly or to third parties before resolution
- Allow reasonable time for investigation and remediation

## Coordinated Disclosure

We ask that you keep details private until:

- A fix is released, or
- We agree on a disclosure date

We will work with you to establish a reasonable timeline.

## Our Commitment

Upon receiving your disclosure, we commit to:

- Acknowledge within 1 business day
- Keep you informed throughout remediation
- Resolve vulnerabilities in a timely manner
- Credit you (with consent) in security acknowledgments or changelogs

## Safe Harbor

If you act in good faith and follow this policy, we will not pursue legal action against you for security research that:

- Avoids privacy violations and data destruction
- Avoids service disruption
- Is limited to what is necessary to demonstrate the vulnerability
- Does not involve accessing data that is not your own

## Out-of-Scope

The following are out-of-scope:

- Code execution from explicitly configured custom code or templates in fields that execute code in OSS (expected behavior)
- Direct local API access or browser access to the OSS local server (`promptfoo view`)
- Adversarial eval content flowing through the configured template engine and eval pipeline (e.g., model output in grading prompts or reports)
- Issues requiring users to run untrusted configs, scripts, prompt packs, fixtures, datasets, providers, models, remote content, or model-output feedback loops with local privileges
- Data that remains in your own local logs, databases, caches, reports, exports, or views, unless a promised security or redaction control fails
- Eval snapshots sent to their intended recipients while sharing is enabled. Sharing-control bypasses, failed documented redactions or exclusions, unauthorized access, cross-tenant disclosure, and exposed provider credentials remain in scope
- Reports based only on spoofed `Origin` or `Sec-Fetch-Site` headers from non-browser clients
- Social engineering, phishing, or physical attacks
- Volumetric denial of service
- Vulnerabilities in unsupported versions
- Non-security bugs or feature requests

If unsure whether something is in scope, report it anyway.

Thank you for helping protect Promptfoo users.
