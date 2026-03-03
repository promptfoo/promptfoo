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

The OSS CLI runs in your environment with your user permissions. It is **permissive by default** and executes user-configured code (assertions, providers, transforms, plugins) without sandboxing.

**In scope for OSS:** vulnerabilities where untrusted data inputs (prompts, test cases, model outputs) can trigger code execution, file access, or network access without explicit configuration.

**Out of scope for OSS:** code execution from explicitly configured custom code, since this is expected behavior.

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

- Code execution from explicitly configured custom code in OSS (expected behavior)
- Issues requiring users to run untrusted configs with local privileges
- Social engineering, phishing, or physical attacks
- Volumetric denial of service
- Vulnerabilities in unsupported versions
- Non-security bugs or feature requests

If unsure whether something is in scope, report it anyway.

Thank you for helping protect Promptfoo users.
