---
title: Data Handling and Privacy
sidebar_label: Data handling
description: Understand what data promptfoo transmits during red team testing and how to configure privacy settings.
---

# Data Handling and Privacy

This page explains what data leaves your machine during red team testing and how to control it.

## Data Flow Overview

Red team testing involves three distinct operations, each with different data requirements:

| Operation             | What Runs       | Data Sent Externally                 |
| --------------------- | --------------- | ------------------------------------ |
| **Target evaluation** | Always local    | Only to your configured LLM provider |
| **Test generation**   | Local or remote | Depends on configuration (see below) |
| **Result grading**    | Local or remote | Depends on configuration (see below) |

Your target model is always evaluated locally. Promptfoo never receives your target's responses unless you're using remote grading.

## Default Behavior (No API Key)

Without an `OPENAI_API_KEY`, promptfoo uses hosted inference for test generation and grading. The following data is sent to `api.promptfoo.app`:

**For test generation:**

- Application purpose (from your config's `purpose` field)
- Plugin configuration and settings
- Your email (for usage tracking)

**For grading:**

- The prompt sent to your target
- Your target's response
- Grading criteria

**Never sent:**

- API keys or credentials
- Your promptfooconfig.yaml file
- Model weights or training data
- Files from your filesystem (unless explicitly configured in prompts)

## With Your Own API Key

Setting `OPENAI_API_KEY` routes generation and grading through your OpenAI account instead of promptfoo servers:

```bash
export OPENAI_API_KEY=sk-...
```

Or configure a different provider for grading:

```yaml
redteam:
  provider: anthropic:messages:claude-sonnet-4-20250514
```

With this configuration, promptfoo servers receive only [telemetry](#telemetry).

## Remote-Only Plugins

Some plugins require promptfoo's hosted inference and cannot run locally. These are marked with 🌐 in the [plugin documentation](/docs/red-team/plugins/).

Remote-only plugins include:

- Harmful content plugins (`harmful:*`)
- Bias plugins
- Domain-specific plugins (medical, financial, insurance, pharmacy, ecommerce)
- Security plugins: `ssrf`, `bola`, `bfla`, `indirect-prompt-injection`, `ascii-smuggling`
- Others: `competitors`, `hijacking`, `off-topic`, `system-prompt-override`

Remote-only strategies include: `audio`, `citation`, `gcg`, `goat`, `jailbreak:composite`, `jailbreak:hydra`, `jailbreak:likert`, `jailbreak:meta`

## Disabling Remote Generation

To run entirely locally:

```bash
export PROMPTFOO_DISABLE_REMOTE_GENERATION=true
```

This disables all remote-only plugins and strategies. You must provide your own `OPENAI_API_KEY` or configure a local model for generation and grading.

For red-team-specific control (keeps SimulatedUser remote generation enabled):

```bash
export PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION=true
```

See [Configuring Inference](/docs/red-team/troubleshooting/inference-limit/) for detailed setup.

## Telemetry

Promptfoo collects anonymous usage telemetry:

- Commands run (`redteam generate`, `redteam run`, etc.)
- Plugin and strategy types used (not content)
- Assertion types

No prompt content, responses, or personally identifiable information is included.

To disable:

```bash
export PROMPTFOO_DISABLE_TELEMETRY=1
```

See [Telemetry Configuration](/docs/configuration/telemetry/) for details.

## Network Requirements

When using remote generation, promptfoo requires access to:

| Domain              | Purpose                              |
| ------------------- | ------------------------------------ |
| `api.promptfoo.app` | Test generation and grading          |
| `api.promptfoo.dev` | Consent tracking for harmful plugins |
| `a.promptfoo.app`   | Telemetry (PostHog)                  |

If blocked by your firewall, see [Remote Generation Troubleshooting](/docs/red-team/troubleshooting/remote-generation/).

## Enterprise Deployment

For organizations requiring complete network isolation:

**[Promptfoo Enterprise On-Prem](/docs/enterprise/)** provides:

- Dedicated runner within your network perimeter
- Full air-gapped operation
- Self-hosted inference for all plugins
- No data transmission to external servers

See the [Enterprise Overview](/docs/enterprise/) for deployment options.

## Configuration Summary

| Requirement                  | Configuration                                                             |
| ---------------------------- | ------------------------------------------------------------------------- |
| No data to promptfoo servers | Set `OPENAI_API_KEY` + `PROMPTFOO_DISABLE_TELEMETRY=1`                    |
| Local generation only        | Set `PROMPTFOO_DISABLE_REMOTE_GENERATION=true` + configure local provider |
| Air-gapped deployment        | Use [Enterprise On-Prem](/docs/enterprise/)                               |

## Related Documentation

- [Privacy Policy](/privacy/)
- [Telemetry Configuration](/docs/configuration/telemetry/)
- [Remote Generation Configuration](/docs/red-team/configuration/#remote-generation)
- [Configuring Inference](/docs/red-team/troubleshooting/inference-limit/)
- [Self-Hosting](/docs/usage/self-hosting/)
