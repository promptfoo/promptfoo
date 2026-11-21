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

Treat Promptfoo configuration files and sources you configure to supply executable code as trusted code. Selecting a source of eval inputs authorizes the feature to process that content for its documented purpose. The feature's documented security restrictions apply each time it processes that content. Run untrusted configs, scripts, prompt packs, fixtures, datasets, providers, models, remote content, model-output feedback loops, or pull requests only when the run is isolated and secrets are scoped for that run.

Rendering input in an operator-configured template is expected, including when the operator interpolates that input into a field that executes code. Report a vulnerability if Promptfoo executes runtime data as code outside what the operator configured or bypasses a supported security control while processing that data.

A stall or crash is in scope when Promptfoo’s built-in processing consumes disproportionate resources while handling modest attacker-controlled input.

Report disclosures to a user, tenant, or destination the operator did not authorize to receive that data. Sensitive data confined to the same local account is generally a privacy or hardening issue. A documented redaction or exclusion rule, or one you configure using a supported setting, must still protect the data it covers wherever the feature says it applies.

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

The protections described above also apply when a configured feature processes untrusted input.

- Code execution from explicitly configured custom code or templates in fields that execute code in OSS (expected behavior)
- Direct local API access or browser access to the OSS local server (`promptfoo view`)
- Adversarial eval content flowing through the configured template engine and eval pipeline (e.g., model output in grading prompts or reports)
- Issues requiring users to run untrusted configs, scripts, prompt packs, fixtures, datasets, providers, models, remote content, or model-output feedback loops with local privileges
- Sensitive data present only in local logs, databases, caches, reports, exports, or UI views under the same local user account, when Promptfoo honors the security controls that apply to that data
- Reports based only on spoofed `Origin` or `Sec-Fetch-Site` headers from non-browser clients
- Social engineering, phishing, or physical attacks
- Requests to extend best-effort detection of sensitive data beyond the documented or user-configured rules
- Volumetric denial of service
- Vulnerabilities in unsupported versions
- Non-security bugs or feature requests

If unsure whether something is in scope, report it anyway.

Thank you for helping protect Promptfoo users.
