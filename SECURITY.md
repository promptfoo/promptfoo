# Security Policy

Promptfoo takes security seriously. We appreciate responsible disclosure and will work with you to address valid issues.

## Security Model

Promptfoo is a developer tool that runs in your environment with your user permissions. It is designed to be **permissive by default**.

Some features intentionally execute user-provided code (custom assertions, providers, transforms, plugins). This code execution is **not sandboxed** and should be treated the same way you would treat running a Node.js script locally.

**Important:** Treat Promptfoo configuration files and any referenced scripts as **trusted code**. Do not run Promptfoo against untrusted configs, prompt packs, or pull requests without isolation.

### Local Web Server

The local web server (`promptfoo view`) is a **single-user development tool** intended for use on your local machine. The web API executes evaluations with the same privileges as the CLI — inputs to the API (including provider configurations, transforms, and assertions) are treated as **trusted code**, equivalent to a local config file. The server is not designed to be exposed to untrusted networks or users.

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
- Vulnerabilities in CLI, config parsing, or web UI affecting confidentiality, integrity, or availability beyond the intended trust model described above
- Algorithmic complexity DoS (crafted input causing hang/crash with modest input size)

**Out of scope:**

- Code execution from **explicitly configured** custom code (JS assertions, providers, transforms, plugins configured in your config file)
- Code execution via the **local web API** — the local server has the same trust level as the CLI and executes evaluation configurations with user privileges (see [Local Web Server](#local-web-server))
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
