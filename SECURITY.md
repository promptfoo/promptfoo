# Security Policy

Promptfoo takes security seriously. We appreciate responsible disclosure and will work with you to address valid issues.

## Security Model and Assumptions

Promptfoo is a developer tool that runs in your environment with your user permissions.

Some Promptfoo features intentionally execute user-provided code (for example, loading JavaScript for custom assertions, providers, transforms, or other extensions). This code execution is **not sandboxed** and should be treated the same way you would treat running a Node.js script locally.

**Important:** Treat Promptfoo configuration files and any referenced scripts as **trusted code**. Do not run Promptfoo against untrusted configs, prompt packs, or pull requests without isolation.

## Hardening Recommendations

If you need to run Promptfoo in higher-risk contexts (CI, shared machines, evaluating third-party configs), consider:

- Run inside a container or VM with minimal privileges.
- Use a dedicated, least-privileged API key for model providers.
- Avoid placing secrets in prompts, fixtures, or config files.
- Restrict network egress when feasible (especially if running third-party JS).
- Use read-only mounts where possible and avoid running with access to sensitive files.
- In CI: do not run Promptfoo with secrets on untrusted PRs (for example, from forks).

## Supported Versions

We provide security fixes for supported versions only.

| Version                  | Supported |
| ------------------------ | --------- |
| `main` branch            | ✅        |
| Latest published release | ✅        |
| Older releases           | ❌        |

If you are unsure whether your version is supported, report anyway and include the version/commit SHA.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security reports.

Instead, report privately via one of these channels:

- **GitHub Security Advisories:** Use the repo's "Report a vulnerability" button (preferred).
- **Email:** security@promptfoo.dev (fallback: support@promptfoo.dev)

We will acknowledge your report within **1 business day**.

Please include:

- A clear description of the issue and security impact
- Steps to reproduce (or a proof-of-concept)
- Affected versions and environment details
- Whether the issue is remotely exploitable or requires local access
- Any relevant logs, screenshots, or links
- Your preferred name/handle for credit (optional)

For our full disclosure policy, safe harbor provisions, and additional details, see our [Responsible Disclosure Policy](https://www.promptfoo.dev/responsible-disclosure-policy/).

## What We Consider a Vulnerability

We generally consider the following **in scope**:

- Code execution, file access, or network access that occurs **without clear user intent** or without an explicit feature enabling it
- Loading or executing code from unexpected locations (for example, remote sources) without clear user intent or guardrails
- Path traversal, arbitrary file read/write, credential exfiltration, or privilege escalation beyond what a user would reasonably expect from running Promptfoo
- Vulnerabilities in the CLI, config parsing, web UI, or any shipped integrations that allow an attacker to impact confidentiality, integrity, or availability

The following are generally **out of scope** (or "expected behavior"), unless there is a bypass of a stated guardrail:

- Arbitrary code execution when a user explicitly enables or supplies executable JavaScript or scripts (for example, custom assertions/providers/transforms)
- Vulnerabilities that require a user to run untrusted code/configuration with full local privileges
- Issues in third-party dependencies that do not materially change Promptfoo's security posture (please report upstream too)
- Social engineering, phishing, or physical attacks
- Denial of service from unreasonable traffic volumes

If you are unsure whether something is in scope, report it anyway.

Thank you for helping keep Promptfoo and its users safe.
