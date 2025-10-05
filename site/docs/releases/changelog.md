---
sidebar_label: Changelog
---

# Changelog

We publish a list of new features every week. For more recent updates, check out our GitHub page.

## September 2025

### Providers {#september-2025-providers}

#### New Providers

- **[Claude 4.5 Sonnet](/docs/providers/anthropic/)** - Support for Anthropic's latest model
- **[Claude web tools](/docs/providers/anthropic/#web-tools)** - `web_fetch_20250910` and `web_search_20250305` tool support
- **[GPT-5](/docs/providers/openai/)** - GPT-5, GPT-5 Codex, and GPT-5 Mini support
- **[OpenAI Realtime API](/docs/providers/openai/#realtime-api)** - Full audio input/output for GPT Realtime models
- **[Nscale](/docs/providers/nscale/)** - Image generation provider
- **[CometAPI](/docs/providers/cometapi/)** - 7 models with environment variable configuration
- **[Envoy AI Gateway](/docs/providers/envoy/)** - Route requests through Envoy gateway
- **[Meta Llama API](/docs/providers/)** - All 7 Meta Llama models including multimodal Llama 4

#### Provider Updates

- **[Gemini 2.5 Flash](/docs/providers/google/)** - Flash and Flash-Lite model support
- **[AWS Bedrock](/docs/providers/aws-bedrock/)** - Qwen models, OpenAI GPT models, API key authentication
- **[AWS Bedrock Agents](/docs/providers/bedrock-agents/)** - Agent Runtime support (renamed from AgentCore)
- **[AWS Bedrock inference profiles](/docs/providers/aws-bedrock/#application-inference-profiles)** - Application-level inference profile configuration
- **[HTTP provider](/docs/providers/http/)** - TLS certificate configuration via web UI
- **[WebSocket provider](/docs/providers/websocket/)** - Custom endpoint URLs for OpenAI Realtime
- **[Ollama](/docs/providers/ollama/)** - Thinking parameter configuration
- **Azure Responses** - `azure:responses` provider alias

### Red Teaming {#september-2025-redteam}

#### Plugins

- **[Reusable custom policies](/docs/red-team/plugins/policy/)** - Create policy libraries, upload via CSV, set severity levels, generate test cases
- **[VLGuard](/docs/red-team/plugins/vlguard/)** - Multi-modal vision-language model safety testing
- **[Special Token Injection](/docs/red-team/plugins/special-token-injection/)** - ChatML tag vulnerability testing (`<|im_start|>`, `<|im_end|>`)
- **Financial plugins** - [Confidential Disclosure](/docs/red-team/plugins/financial/#financial-confidential-disclosure), [Counterfactual](/docs/red-team/plugins/financial/#financial-counterfactual), [Defamation](/docs/red-team/plugins/financial/#financial-defamation), [Impartiality](/docs/red-team/plugins/financial/#financial-impartiality), [Misconduct](/docs/red-team/plugins/financial/#financial-misconduct)

#### Strategies & Features

- **[Layer strategy](/docs/red-team/strategies/#layered-strategies)** - Chain multiple strategies in a single scan
- **[Risk scoring](/docs/red-team/)** - Quantitative risk scores in vulnerability reports
- **Threshold configuration** - Set minimum pass scores for tests
- **[ISO 42001 compliance](/docs/red-team/iso-42001/)** - Framework compliance mappings

### Enterprise {#september-2025-enterprise}

- **Probe licensing** - Usage-based licensing with enforcement and visibility
- **Audit logging** - UI for webhooks, teams, providers, and user management audit trails
- **IDP mapping** - Identity provider team and role mapping for SSO
- **Session configuration** - Timeout and inactivity settings

### Evaluation Features {#september-2025-evals}

#### CLI & Developer Experience

- **Pause/resume** - `Ctrl+C` to pause, `promptfoo eval --resume` to continue
- **Team switching** - Switch teams from command line
- **Log export** - `promptfoo export logs` creates tar.gz for debugging
- **CI progress reporting** - Text-based milestone reporting for long-running evals

#### UI & Results

- **Keyboard navigation** - Navigate results table with keyboard shortcuts
- **Bulk delete** - Delete multiple eval results at once
- **Unencrypted attack display** - Show both encoded and decoded attack forms
- **Passes-only filter** - Filter to show only passing results
- **Severity filtering** - Filter by severity level
- **Metadata exists operator** - Filter by metadata field presence
- **Highlight filtering** - Filter results by highlighted content
- **Persistent headers** - Report page headers remain visible when scrolling

#### Export & Sharing

- **Enhanced CSV exports** - Includes latency, grader reason, and grader comment
- **Default cloud sharing** - Auto-enable sharing when connected to Promptfoo Cloud

#### Configuration

- **Context arrays** - Pass context as array of strings ([example](/docs/configuration/expected-outputs/model-graded/context-relevance/#array-context))
- **MCP preset** - Pre-configured Model Context Protocol plugin set
