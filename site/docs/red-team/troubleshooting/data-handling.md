---
title: Data Handling and Privacy
sidebar_label: Data handling
description: Understand what data is sent to promptfoo servers during red-team evals and how to configure privacy for secure, compliant testing.
---

# Data handling and privacy

This guide explains what data promptfoo sends to external services and how to control data transmission for compliance and security requirements.

## What data is sent to Promptfoo servers

### Community version

1. **Red team test generation**: Application details and purpose description for creating contextual attacks.
2. **Test result grading**: Prompts and responses for vulnerability assessment (unless you use your own OpenAI API key or override [`redteam.provider`](/docs/red-team/configuration/#changing-the-model) for grading).
3. **Basic telemetry**: Anonymous usage analytics (see [telemetry docs](/docs/configuration/telemetry/)).

### What is NOT sent

Promptfoo never sends:

- Model weights or training data
- Configuration files or secrets

With local grading configured (using your own API keys or overriding `redteam.provider`):

- Test cases and results are not sent to promptfoo servers
- Only anonymous telemetry is sent (unless disabled)

With telemetry disabled (`PROMPTFOO_DISABLE_TELEMETRY=1`):

- No anonymous usage analytics are sent
- Red team generation and grading still use configured providers (local or remote)

## How to minimize external data transmission

### 1. Use your own OpenAI API key

Set `OPENAI_API_KEY` in your environment - promptfoo automatically detects it and uses your key for grading instead of our servers.

### 2. Disable telemetry

```bash
export PROMPTFOO_DISABLE_TELEMETRY=1
```

### 3. Force local generation

To default to local red team generation instead of remote, you can use:

```bash
export PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION=true
```

**Note**: This will disable many plugins that require remote generation capabilities.

### 4. Disable updates (for offline environments)

For completely offline environments, also disable update checks:

```bash
export PROMPTFOO_DISABLE_UPDATE=1
```

Note: Local generation quality depends on your configured model and is generally lower than our remote service. See the [red team configuration guide](/docs/red-team/configuration/) and [red team remote generation section](/docs/red-team/configuration/#remote-generation) for details.

## Enterprise solutions for complete data control

For organizations requiring complete data isolation, see [Enterprise On-Prem](/docs/enterprise/) which provides:

- Fully airgapped deployments with no external dependencies.
- Dedicated runner within your infrastructure.
- Complete control over all data flow.
- Enterprise-grade security and compliance features.
- Compliance support for regulated industries (banking, healthcare, government).

## Network connectivity requirements

Community version requires access to:

- `api.promptfoo.app` - Test generation and grading.
- `*.promptfoo.app` - Additional API services.

### Corporate firewall issues

If blocked by corporate firewall:

1. Request IT allowlist Promptfoo domains.
2. Test with: `curl https://api.promptfoo.app/version`.
3. See [remote generation troubleshooting](/docs/red-team/troubleshooting/remote-generation/).

## Verifying data transmission

To verify what data promptfoo sends:

- **Monitor network traffic**: Use tools like Burp Suite or Wireshark to inspect outbound connections
- **Check logs**: Review promptfoo logs for external API calls
- **Test first**: Start with dummy data to verify your configuration before using sensitive information

## Related documentation

- [Telemetry configuration](/docs/configuration/telemetry/)
- [Red Team configuration](/docs/red-team/configuration/)
- [Remote generation troubleshooting](/docs/red-team/troubleshooting/remote-generation/)
- [Enterprise solutions](/docs/enterprise/)
- [Privacy policy](/privacy/)
