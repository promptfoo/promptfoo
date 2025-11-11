---
title: Data Handling and Privacy
sidebar_label: Data handling
description: What data promptfoo collects and how to configure data transmission.
---

# Data handling and privacy

What data promptfoo collects depends on your API key configuration.

## Data sent to promptfoo servers

### Without OPENAI_API_KEY

Promptfoo provides free remote generation and grading using promptfoo's OpenAI account. Data sent:

- **Test generation**: Application details and purpose description
- **Grading**: Prompts and model responses
- **Telemetry**: Anonymous usage analytics

### With OPENAI_API_KEY

Your OpenAI key is used for both generation and grading via your OpenAI account. Data sent:

- **Telemetry only**: Anonymous usage analytics

**Exception**: If you configure [`redteam.provider`](/docs/red-team/configuration/#changing-the-model), that provider is used for grading instead of OpenAI.

### Never sent

- Model weights or training data
- Configuration files or secrets
- API keys or credentials

## Recommended configurations

**Development and testing:**

Use the free tier. Promptfoo handles generation and grading via promptfoo's OpenAI account.

**Production or sensitive data:**

Set your OpenAI API key. Test data goes to your OpenAI account, not promptfoo servers:

```bash
export OPENAI_API_KEY=sk-...
```

Disable telemetry if required. See [telemetry configuration](/docs/configuration/telemetry/).

**Regulated industries:**

Use [Enterprise on-prem](/docs/enterprise/) for airgapped deployment with no external data transmission.

## Additional controls

**Force local generation:**

Disable remote generation to use your local provider. See [remote generation configuration](/docs/red-team/configuration/#remote-generation).

**Offline environments:**

Disable update checks: `PROMPTFOO_DISABLE_UPDATE=1`

## Data retention and usage

**Test data:**

When using remote generation and grading (without `OPENAI_API_KEY`), test data is processed to generate tests and grade results. See [privacy policy](/privacy/) for retention details.

**Telemetry:**

Anonymous usage analytics are collected for product improvements. No personally identifiable information. See [telemetry documentation](/docs/configuration/telemetry/).

## Network connectivity

Without `OPENAI_API_KEY`, the community version requires access to:

- `api.promptfoo.app` - Test generation and grading
- `*.promptfoo.app` - Additional services

**Corporate firewall issues:**

If blocked, allowlist promptfoo domains or see [remote generation troubleshooting](/docs/red-team/troubleshooting/remote-generation/).

## Related documentation

- [Telemetry configuration](/docs/configuration/telemetry/)
- [Remote generation](/docs/red-team/configuration/#remote-generation)
- [Enterprise on-prem](/docs/enterprise/)
- [Privacy policy](/privacy/)
