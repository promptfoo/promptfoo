---
title: Data Handling and Privacy
sidebar_label: Data handling
description: What data promptfoo collects and how to configure data transmission.
---

# Data handling and privacy

Data sent to promptfoo servers depends on your configuration.

## Data sent to promptfoo servers

**Regular evals** (non-red team):

- Anonymous telemetry only
- Test cases run locally against your target
- No test content sent to promptfoo

**Red team testing without `OPENAI_API_KEY`:**

- Test generation: Application details and purpose
- Grading: Prompts and model responses
- Telemetry: Anonymous usage analytics

Many plugins, strategies, and jailbreak methods require remote generation:

- 20+ plugins (competitors, hijacking, indirect-prompt-injection)
- Strategies (citation, gcg, likert, audio/image/video, math-prompt)
- Jailbreak methods (hydra, goat, iterativeMeta, bestOfN)

**Red team testing with `OPENAI_API_KEY`:**

- Telemetry only
- Generation and grading use your OpenAI account
- Test data goes to OpenAI, not promptfoo servers

If you configure [`redteam.provider`](/docs/red-team/configuration/#changing-the-model), that provider is used for grading.

## What is never sent

- Model weights or training data
- Configuration files or secrets
- API keys or credentials

## Configuration recommendations

**Development and testing:**

Use the free tier without setting `OPENAI_API_KEY`. Generation and grading use promptfoo's OpenAI account.

**Production or sensitive data:**

Set your OpenAI API key:

```bash
export OPENAI_API_KEY=sk-...
```

Test data goes to your OpenAI account, not promptfoo servers. Optionally disable telemetry (see [telemetry configuration](/docs/configuration/telemetry/)).

**Regulated industries:**

Use [Enterprise on-prem](/docs/enterprise/) for airgapped deployment.

## Advanced options

**Disable remote generation:**

Force local generation with your own provider:

```bash
export PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION=true
```

**Warning**: Disables 20+ plugins, multiple strategies (citation, gcg, likert, audio/image/video, math-prompt), and jailbreak methods (hydra, goat, iterativeMeta, bestOfN). See [remote generation configuration](/docs/red-team/configuration/#remote-generation).

**Offline environments:**

Disable update checks:

```bash
export PROMPTFOO_DISABLE_UPDATE=1
```

## Data retention

**Test data:**

With remote generation (without `OPENAI_API_KEY`), promptfoo processes test data to generate tests and grade results. See [privacy policy](/privacy/) for retention details.

**Telemetry:**

Promptfoo collects anonymous usage analytics. No personally identifiable information. See [telemetry documentation](/docs/configuration/telemetry/).

## Network requirements

Without `OPENAI_API_KEY`, promptfoo requires access to:

- `api.promptfoo.app` - Test generation and grading
- `*.promptfoo.app` - Additional services

If blocked by corporate firewall, allowlist these domains or see [remote generation troubleshooting](/docs/red-team/troubleshooting/remote-generation/).

## Related documentation

- [Telemetry configuration](/docs/configuration/telemetry/)
- [Remote generation](/docs/red-team/configuration/#remote-generation)
- [Enterprise on-prem](/docs/enterprise/)
- [Privacy policy](/privacy/)
