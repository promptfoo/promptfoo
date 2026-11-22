---
title: Data Handling and Privacy
sidebar_label: Data handling
description: Understand what data promptfoo transmits during red team testing and how to configure privacy settings.
---

# Data Handling and Privacy

This page explains what data leaves your machine during red team testing and how to control it.

## Data Flow Overview

The [setup agent](/docs/red-team/quickstart/#initialize-the-project) sends your conversation, the proposed test plan and the connection you describe to Promptfoo Cloud by default. This includes URLs, example requests, header names and environment variable names. It also sends validation feedback so the agent can correct its proposals. This applies even if you have a model API key. **Never paste keys, passwords or private records.** Promptfoo catches some accidental pastes, but cannot recognize every secret. Use manual setup to skip the hosted conversation.

**Test connection** sends one “Hello” from your local server to the endpoint you approve. Promptfoo reads the key locally and sends it to your target. For a connection discussed in chat, the agent receives the check status and suggested reply field names. Promptfoo keeps the actual reply text and resolved key out of that feedback. If you use a saved target without sharing its details in chat, the agent sees only whether its test passed. The **manual editor’s** provider test can send the target configuration, request headers and response to Cloud.

Drafting never contacts your target. Only **Run Now** starts the scan, which can send target replies for grading as described below.

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
- Red team target/provider setup details, including request examples, target URLs, and auth headers entered into setup or test forms
- Your email (for usage tracking)

**For grading:**

- The prompt sent to your target
- Your target's response
- Grading criteria

**Not sent by default during generation/grading:**

- API keys or credentials stored in local environment variables
- Model weights or training data
- Files from your filesystem (unless explicitly configured in prompts)

Credentials, authorization headers, provider config fields, and request examples **are** sent if you paste them into red team target/provider setup or test forms, sharing, Cloud sync, or other Cloud-backed features. Don't enter real secrets into those flows. See the [security policy](https://github.com/promptfoo/promptfoo/blob/main/SECURITY.md) for the full hosted-feature list.

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
