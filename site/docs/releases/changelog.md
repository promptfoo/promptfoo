---
sidebar_label: Changelog
---

# Changelog

We publish a list of new features every week. For more recent updates, check out our GitHub page.

## September 2025

### September 29 {#september-2025-week-4}

#### Providers & Models
- **[Claude 4.5 Sonnet](/docs/providers/anthropic/)** - Support for Anthropic's latest flagship model with improved reasoning
- **[Claude web tools](/docs/providers/anthropic/#web-tools)** - Support for `web_fetch_20250910` and `web_search_20250305` tools
- **[GPT-5 support](/docs/providers/openai/)** - Added support for GPT-5, GPT-5 Codex, and latest model releases
- **[OpenAI gpt-realtime](/docs/providers/openai/#realtime-api)** - Full audio support for GPT Realtime models with audio input/output
- **[Nscale provider](/docs/providers/nscale/)** - New provider integration with image generation support
- **[CometAPI provider](/docs/providers/cometapi/)** - Support for CometAPI's 7 models with environment variable configuration
- **[Gemini 2.5 Flash](/docs/providers/google/)** - Support for latest Gemini Flash and Flash-Lite models
- **[AWS Bedrock Qwen models](/docs/providers/aws-bedrock/)** - Added support for Qwen models in AWS Bedrock

#### Features
- **Metadata exists operator** - New `exists` operator for filtering eval results by metadata presence
- **CLI team switching** - Switch between teams directly from the command line
- **Latency in CSV exports** - Eval exports now include latency, grader reason, and grader comment columns
- **Filter by highlights** - Filter eval results by highlighted content with full backend support

### September 22 {#september-2025-week-3-end}

#### Red Teaming
- **Multilingual provider support** - Red team across multiple languages with automatic language detection and improved grading
- **ISO 42001 compliance mappings** - Framework compliance testing for AI governance standards

#### UI/UX Improvements
- **Vulnerability report table improvements** - Enhanced design and usability for red team vulnerability reports
- **Persistent report headers** - Headers remain visible while scrolling on report pages
- **Reduce false rejections** - Updated prompts to reduce AI refusal rates in red team testing

#### Providers
- **[Envoy AI Gateway](/docs/providers/envoy/)** - New provider for routing through Envoy gateway

### September 15 {#september-2025-week-3}

#### Red Teaming
- **[Reusable custom policies](/docs/red-team/plugins/policy/)** - Build a library of custom security policies to reuse across evaluations
- **[Layer strategy](/docs/red-team/strategies/#layered-strategies)** - Chain multiple strategies in red team scans for sophisticated attack patterns
- **Threshold support** - Set minimum score thresholds for red team tests to pass
- **Upload custom policies via CSV** - Bulk upload custom policies through the red team setup UI
- **Keyboard navigation** - Navigate results table with keyboard shortcuts for faster analysis
- **Severity filtering** - Filter custom policies and results by severity level

#### Providers
- **[AWS Bedrock Agents](/docs/providers/bedrock-agents/)** - Support for AWS Bedrock Agent Runtime (renamed from AgentCore)
- **[AWS Bedrock inference profiles](/docs/providers/aws-bedrock/#application-inference-profiles)** - Reference inference profiles instead of individual model IDs
- **`azure:responses` provider alias** - Convenient alias for Azure Responses API

#### Features
- **Context as array of strings** - Provide context to tests as an array instead of a single string ([example](/docs/configuration/expected-outputs/model-graded/context-relevance/#array-context))
- **Unencrypted attack display** - Results table shows both encoded and decoded forms of attacks using encoding strategies
- **Bulk delete evals** - Delete multiple eval results at once on the Evals Results page
- **MCP plugins preset** - Pre-configured plugin set for Model Context Protocol testing

### September 8 {#september-2025-week-2}

#### Red Teaming
- **[VLGuard multi-modal plugin](/docs/red-team/plugins/vlguard/)** - Test vision-language models for multi-modal safety using the vlguard_unsafes dataset
- **[Risk scoring](/docs/red-team/)** - Quantitative risk scores added to Vulnerability Reports for better security assessment
- **Custom policy severity** - Assign custom severity levels to reusable policies
- **Test case generation** - Generate sample test cases for custom policies directly in the plugins view

#### Features
- **Pause and resume evals** - Use `Ctrl+C` to pause and `promptfoo eval --resume` to continue long-running evaluations
- **Export logs command** - `promptfoo export logs` creates a tar.gz archive for debugging and support
- **Passes-only filter** - New filter mode to show only passing test results

#### Providers
- **[Custom WebSocket URLs](/docs/providers/websocket/)** - Configure custom endpoints for OpenAI Realtime API
- **[Ollama thinking support](/docs/providers/ollama/)** - Configuration options for Ollama's thinking parameter

### September 1 {#september-2025-week-1}

#### Red Teaming
- **New financial plugins** - Comprehensive suite for financial domain security:
  - [Financial Confidential Disclosure](/docs/red-team/plugins/financial/#financial-confidential-disclosure) - Tests for leakage of confidential financial information
  - [Financial Counterfactual](/docs/red-team/plugins/financial/#financial-counterfactual) - Detects incorrect hypothetical financial scenarios
  - [Financial Defamation](/docs/red-team/plugins/financial/#financial-defamation) - Identifies defamatory financial statements
  - [Financial Impartiality](/docs/red-team/plugins/financial/#financial-impartiality) - Tests for biased financial advice
  - [Financial Misconduct](/docs/red-team/plugins/financial/#financial-misconduct) - Detects recommendations of financial misconduct
- **[Special Token Injection plugin](/docs/red-team/plugins/special-token-injection/)** - Tests for vulnerabilities with ChatML format tags (`<|im_start|>`, `<|im_end|>`) and similar delimiters

#### Enterprise Features
- **Probe licensing enforcement** - Usage-based licensing with visibility and limits for red team probes
- **Audit logging UI** - Comprehensive audit trail for webhooks, teams, providers, and user management
- **IDP organization mapping** - Map identity provider teams and roles for seamless SSO integration
- **Session timeout configuration** - Configurable session timeout and inactivity settings

#### Providers
- **[AWS Bedrock enhancements](/docs/providers/aws-bedrock/)** - AgentCore provider, OpenAI GPT model support, and API key authentication
- **[Meta Llama API](/docs/providers/)** - Support for all 7 Meta Llama models including multimodal Llama 4 variants
- **[HTTP provider TLS certificates](/docs/providers/http/)** - Configure TLS certificates through the web interface

#### Features
- **CI-friendly progress reporting** - Long-running evals switch to text-based milestone reporting for better CI/CD integration
- **Default cloud sharing** - Results sharing enabled by default when connected to Promptfoo Cloud (configurable)
- **Probe usage tracking** - Only count providers against licenses when actively used in scans
