---
title: Data Handling and Privacy
sidebar_label: Data handling
description: Understand what data promptfoo transmits during red team testing and how to configure privacy settings.
---

# Data Handling and Privacy

This page explains what data leaves your machine during red team testing and how to control it.

## Data Flow Overview

The [setup agent](/docs/red-team/quickstart/#initialize-the-project) sends your conversation and the **full configuration drafted in chat** to Promptfoo Cloud, even if you have a model API key. That can include prompts, URLs, request examples, static header values and environment variable names. Your local server validates the draft and can send the rejected configuration and validation errors back to the agent for correction. It doesn’t automatically include a saved manual configuration.

**Never paste credentials or private records into chat.** Promptfoo checks for common secret formats, but can’t catch every secret. Give the agent the names of environment variables. To skip the hosted conversation, choose manual setup.

Drafting never contacts your target. **Test connection** sends one “Hello” from your local server to the selected HTTP target, with the headers shown in the draft. Promptfoo resolves credential variables locally, refuses redirects and sends the agent a summary of the result. The summary can include HTTP status, missing variable names and candidate reply field names. It excludes the returned text and resolved credentials.

The manual editor’s provider test can send the target configuration, request headers and response to Cloud. **Run Now** starts the scan and may send target replies for grading.

Running a scan involves three operations.

| Operation             | What Runs       | Data Sent Externally                 |
| --------------------- | --------------- | ------------------------------------ |
| **Target evaluation** | Always local    | Only to your configured LLM provider |
| **Test generation**   | Local or remote | Depends on configuration (see below) |
| **Result grading**    | Local or remote | Depends on configuration (see below) |

Your target model is always evaluated locally. Promptfoo receives target responses only when you use a hosted flow that requires them, such as remote grading or red team target discovery.

## Default Behavior (No API Key)

Without an `OPENAI_API_KEY` or a custom provider, red team plugins can use hosted inference for test generation and grading. By default these requests go to `api.promptfoo.app`.

**For test generation:**

- Application purpose (from your config's `purpose` field)
- Plugin configuration and settings
- Complete document contents and the requested goal when using `promptfoo redteam poison` — this command always uses hosted generation, even when your own API key is configured
- Your email (for usage tracking)

**For grading:**

- The prompt sent to your target
- Your target's response
- Grading criteria

**Not sent by default during generation/grading:**

- API keys or credentials stored in local environment variables
- Model weights or training data
- Files from your filesystem (unless explicitly configured in prompts)

Cloud-backed features such as setup, sharing and Cloud sync can transmit credentials and private request examples you paste into them. Don't enter real secrets into those flows. See the [security policy](https://github.com/promptfoo/promptfoo/blob/main/SECURITY.md) for the full hosted-feature list.

## With Your Own API Key

Setting `OPENAI_API_KEY` routes generation and grading through your OpenAI account instead of Promptfoo servers:

```bash
export OPENAI_API_KEY=sk-...
```

Or configure a different provider for grading:

```yaml
redteam:
  provider: anthropic:messages:claude-sonnet-5
```

With this configuration, Promptfoo servers usually receive only [telemetry](#telemetry) unless you use red team target/provider setup helpers, red team target/provider test requests, sharing, Cloud sync, hosted reports, or other Cloud-backed features.

## With Your ChatGPT Subscription

Some text assertions can use `openai:codex-sdk` when you're signed in to Codex with ChatGPT. Without an API key or explicit grader, red team plugins can still send your target's responses and grading criteria to Promptfoo Cloud. To control where grading runs, [configure a grader](/docs/red-team/troubleshooting/grading-results/). Embedding and moderation assertions still need a provider with API credentials.

## Remote-Only Plugins

Some plugins require Promptfoo's hosted inference and cannot run locally. These are marked with 🌐 in the [plugin documentation](/docs/red-team/plugins/).

Remote-only plugins include:

- Harmful content plugins (`harmful:*`)
- Bias plugins
- Domain-specific plugins (medical, financial, insurance, pharmacy, ecommerce)
- Security plugins: `ssrf`, `bola`, `bfla`, `indirect-prompt-injection`, `ascii-smuggling`
- Others: `competitors`, `hijacking`, `off-topic`, `system-prompt-override`

Remote-only strategies include: `audio`, `citation`, `gcg`, `goat`, `jailbreak:composite`, `jailbreak:goblin`, `jailbreak:hydra`, `jailbreak:likert`, `jailbreak:meta`

## Disabling Remote Generation

To prefer local generation:

```bash
export PROMPTFOO_DISABLE_REMOTE_GENERATION=true
```

This disables supported remote-generation fallbacks for red team generation paths, including red team target/provider setup helpers that rely on remote generation. It is not a network isolation guarantee and does not disable telemetry, account/license checks, sharing, Cloud sync, red team target/provider test requests, red team target/provider setup helpers that do not rely on remote generation, or explicitly configured providers. You must provide your own `OPENAI_API_KEY` or configure a local model for generation and grading.

For red-team-specific control (keeps SimulatedUser remote generation enabled):

```bash
export PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION=true
```

See [Configuring Inference](/docs/red-team/troubleshooting/inference-limit/) for detailed setup.

## Telemetry

Promptfoo collects usage telemetry:

- Commands run (`redteam generate`, `redteam run`, etc.)
- Plugin and strategy types used (not content)
- Assertion types

Hosted telemetry may include package version, CI status, promptfoo user ID, email address, cloud login status, and authentication method when those values are present in the local promptfoo config. Prompt content, model responses, generated test cases, provider API keys, and full configuration files are not included.

To disable:

```bash
export PROMPTFOO_DISABLE_TELEMETRY=1
```

See [Telemetry Configuration](/docs/configuration/telemetry/) for details.

## Network Requirements

When using remote generation, Promptfoo requires access to:

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

| Requirement                  | Configuration                                                                                                                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No data to Promptfoo servers | Use API-key/local providers for every generation, grading, embedding, and moderation path; avoid remote-only plugins, red team target/provider setup helpers, and red team target/provider test requests; disable telemetry; avoid Cloud sync and sharing |
| Local generation only        | Set `PROMPTFOO_DISABLE_REMOTE_GENERATION=true` + configure local providers for supported generation paths                                                                                                                                                 |
| Air-gapped deployment        | Use [Enterprise On-Prem](/docs/enterprise/)                                                                                                                                                                                                               |

## Related Documentation

- [Privacy Policy](/privacy/)
- [Telemetry Configuration](/docs/configuration/telemetry/)
- [Remote Generation Configuration](/docs/red-team/configuration/#remote-generation)
- [Configuring Inference](/docs/red-team/troubleshooting/inference-limit/)
- [Self-Hosting](/docs/usage/self-hosting/)
