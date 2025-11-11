---
title: Data Handling and Privacy
sidebar_label: Data handling
description: Understand what data is sent to promptfoo servers during red-team evals and how to configure privacy for secure, compliant testing.
---

# Data handling and privacy

When data is sent to promptfoo servers depends on your configuration.

## What data is sent to promptfoo servers

### Without OPENAI_API_KEY set

Promptfoo provides free remote generation and grading. Data sent:

1. **Red team test generation**: Application details and purpose description
2. **Test result grading**: Prompts and responses for vulnerability assessment
3. **Telemetry**: Anonymous usage analytics (see [telemetry docs](/docs/configuration/telemetry/))

### With OPENAI_API_KEY set

Your OpenAI key is used for both generation and grading. You pay for usage. Data sent:

1. **Telemetry only**: Anonymous usage analytics (see [telemetry docs](/docs/configuration/telemetry/))

**Exception**: If `redteam.provider` is configured, that provider is used for grading. See [changing the model](/docs/red-team/configuration/#changing-the-model).

### Never sent

- Model weights or training data
- Configuration files or secrets

## Control data transmission

### Use your own OpenAI API key

Set `OPENAI_API_KEY` to use your own key for both generation and grading:

```bash
export OPENAI_API_KEY=sk-...
```

Promptfoo automatically detects this and routes all requests through your OpenAI account instead of promptfoo servers.

### Disable telemetry

```bash
export PROMPTFOO_DISABLE_TELEMETRY=1
```

### Force local generation

Force local red team generation instead of remote:

```bash
export PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION=true
```

**Note**: Disables many plugins that require remote generation.

### Disable updates

For offline environments:

```bash
export PROMPTFOO_DISABLE_UPDATE=1
```

See [red team configuration](/docs/red-team/configuration/) and [remote generation](/docs/red-team/configuration/#remote-generation) for details.

## Enterprise on-prem

[Enterprise on-prem](/docs/enterprise/) provides:

- Airgapped deployment
- Runs in your infrastructure
- No external data transmission
- Supports regulated industries (banking, healthcare, government)

## Network connectivity

Without `OPENAI_API_KEY`, community version requires access to:

- `api.promptfoo.app` - Test generation and grading
- `*.promptfoo.app` - Additional API services

### Corporate firewall

If blocked:

1. Allowlist promptfoo domains with IT
2. Test connectivity: `curl https://api.promptfoo.app/version`
3. See [remote generation troubleshooting](/docs/red-team/troubleshooting/remote-generation/)

## Verify data transmission

- Monitor network traffic with Burp Suite or Wireshark
- Review promptfoo logs for external API calls
- Test with dummy data first

## Related documentation

- [Telemetry configuration](/docs/configuration/telemetry/)
- [Red Team configuration](/docs/red-team/configuration/)
- [Remote generation troubleshooting](/docs/red-team/troubleshooting/remote-generation/)
- [Enterprise solutions](/docs/enterprise/)
- [Privacy policy](/privacy/)
