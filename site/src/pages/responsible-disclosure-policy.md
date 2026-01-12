---
description: Report security vulnerabilities in Promptfoo responsibly - guidelines for disclosure, safe harbor provisions, and response times
---

# Responsible Vulnerability Disclosure Policy

Promptfoo values the security and privacy of our users, customers, and the broader community. We welcome responsible disclosure of vulnerabilities to help us ensure the ongoing security of our open source projects, cloud services, and on-premises deployments.

## Scope

This policy covers vulnerabilities discovered in:

- Promptfoo Open Source Software
- Promptfoo Cloud Services
- Promptfoo On-premises Software Components

For technical details on our security model, hardening recommendations, and what we consider in-scope vs. out-of-scope, see our [SECURITY.md](https://github.com/promptfoo/promptfoo/blob/main/SECURITY.md) on GitHub.

## Reporting Vulnerabilities

If you discover a potential vulnerability, please report it privately:

- **GitHub Security Advisories:** Use the repo's "Report a vulnerability" button (preferred).
- **Email:** security@promptfoo.dev (fallback: support@promptfoo.dev)

Please **do not** open a public GitHub issue for security reports.

Include the following details:

- Description and steps to reproduce the vulnerability
- Software version and/or cloud environment where the issue was discovered
- Potential security impact
- Whether the issue is remotely exploitable or requires local access
- Your contact information for follow-up (optional)

## Response Time

We will acknowledge your report within **1 business day** and keep you informed throughout the remediation process.

## Responsible Disclosure Guidelines

When researching or disclosing vulnerabilities:

- Do not exploit the vulnerability beyond the minimal testing needed to demonstrate the issue.
- Do not disclose the vulnerability publicly or to third parties before it is resolved.
- Allow Promptfoo reasonable time to investigate and remediate the issue before public disclosure.

## Coordinated Disclosure

We ask that you keep details private until:

- A fix is released, or
- We agree on a disclosure date.

We will work with you to establish a reasonable timeline for public disclosure.

## Our Commitment

Upon receiving your disclosure, Promptfoo commits to:

- Acknowledge your report within 1 business day.
- Keep you informed throughout the remediation process.
- Work diligently to resolve vulnerabilities in a timely manner.
- Provide recognition (with your consent) for your responsible disclosure in our security acknowledgments, changelogs, or other public communications.

## Safe Harbor

If you act in good faith and follow this policy, we will not pursue legal action against you for security research that:

- Avoids privacy violations and data destruction
- Avoids service disruption
- Is limited to what is necessary to demonstrate the vulnerability
- Does not involve accessing data that is not your own

## Out-of-Scope

The following items are out-of-scope for our vulnerability disclosure program:

- Issues related to social engineering or phishing attacks
- Vulnerabilities affecting outdated versions of Promptfoo software (not actively supported)
- Non-security-related bugs or functionality requests
- Denial of service from unreasonable traffic volumes

If you are unsure whether something is in scope, report it anyway.

Thank you for helping us protect Promptfoo users and improve our software's security.
