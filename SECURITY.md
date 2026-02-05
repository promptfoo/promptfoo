# Security Policy

Promptfoo takes security seriously. We appreciate responsible disclosure and will work with you to address valid issues.

## Security Model

Promptfoo is a developer tool that runs in your environment with your user permissions. It is designed to be **permissive by default**.

Some features intentionally execute user-provided code (custom assertions, providers, transforms, plugins). This code execution is **not sandboxed** and should be treated the same way you would treat running a Node.js script locally.

**Important:** Treat Promptfoo configuration files and any referenced scripts as **trusted code**. Do not run Promptfoo against untrusted configs, prompt packs, or pull requests without isolation.

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

## Supported Versions

| Version                  | Supported        |
| ------------------------ | ---------------- |
| Latest published release | ✅               |
| `main` branch            | ✅ (best effort) |
| Older releases           | ❌               |

## Reporting a Vulnerability

**Do not** open a public GitHub issue for security reports.

Report privately via:

- **GitHub Security Advisories:** "Report a vulnerability" button (preferred)
- **Email:** security@promptfoo.dev (fallback: support@promptfoo.dev)

We will acknowledge your report within **1 business day**.

For safe harbor provisions and full process details, see our [Responsible Disclosure Policy](https://www.promptfoo.dev/responsible-disclosure-policy/).

## Scope

**In scope:**

- Code execution, file access, or network access triggered by **untrusted data inputs** (prompts, test cases, fixtures, model outputs) without explicit configuration enabling it
- Bypasses of documented restrictions or isolation boundaries
- Unexpected secret exposure or credential leakage to unconfigured destinations
- Path traversal or arbitrary file read/write from data-only inputs
- Vulnerabilities in CLI, config parsing, or web UI affecting confidentiality, integrity, or availability
- Algorithmic complexity DoS (crafted input causing hang/crash with modest input size)

**Out of scope:**

- Code execution from **explicitly configured** custom code (JS assertions, providers, transforms, plugins configured in your config file)
- Issues requiring the user to run untrusted configs or scripts with local privileges
- Network requests triggered by content in **user-controlled config files** (test variables, prompts, fixtures defined in your config) — users are responsible for what they put in their own configs
- Third-party dependency issues that don't materially affect Promptfoo's security posture (report upstream)
- Social engineering, phishing, or physical attacks
- Volumetric denial of service

**Examples of out-of-scope reports:**

- "A malicious custom assertion reads `process.env` and posts it to a webhook" → Expected behavior; custom code runs with your permissions
- "A third-party prompt pack includes a transform that runs shell commands" → Expected behavior; don't run untrusted configs
- "The Web UI fetches a URL when a test variable contains a URL" → Expected behavior; users control their own config content

If unsure whether something is in scope, report it anyway.

Thank you for helping keep Promptfoo and its users safe.
