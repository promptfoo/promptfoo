---
title: Release Notes
description: Monthly summaries of Promptfoo releases, features, and improvements for the open-source LLM testing framework
tags: [releases, changelog, updates, features]
keywords: [Promptfoo releases, changelog, updates, features, monthly summaries]
---

# Release Notes

Full release history for Promptfoo open source can be found on [GitHub](https://github.com/promptfoo/promptfoo/releases).

## June 2025 Release Highlights

This month we focused on enhancing **observability**, expanding **provider support**, and strengthening **red team capabilities** to help you build more reliable and secure AI applications.

## Evals

### Tracing

#### See Inside Your LLM Applications with OpenTelemetry

We've added [OpenTelemetry tracing support](/docs/tracing/) to help you understand what's happening inside your AI applications. Previously, LLM applications were often "black boxes"—you could see inputs and outputs, but not what happened in between. Now you can visualize the entire execution flow, measure performance of individual steps, and quickly identify issues.

This is especially valuable for complex RAG pipelines or multi-step workflows where you need to identify performance bottlenecks or debug failures.

**Use it when:**

- Debugging slow RAG pipelines
- Optimizing multi-step agent workflows
- Understanding why certain requests fail
- Measuring performance across different providers

### New Models / Providers

#### Expanded Audio and Multimodal Capabilities

As AI applications increasingly use voice interfaces and visual content, you need tools to evaluate these capabilities just as rigorously as text-based interactions. We've significantly expanded support for audio and multimodal AI:

1. **[Google Live Audio](/docs/providers/google/#audio-generation)** - Full audio generation with features like:
   - Voice selection and customization
   - Affective dialog for more natural conversations
   - Real-time transcription
   - Support for Gemini 2.0 Flash and native audio models

2. **[Hyperbolic Provider](/docs/providers/hyperbolic/)** - New support for Hyperbolic's image and audio models, providing more options for multimodal evaluations

3. **[Helicone AI Gateway](/docs/providers/helicone/)** - Route requests through Helicone for enhanced monitoring and analytics

4. **Mistral Magistral** - Added support for Mistral's latest reasoning models

### Other Features

#### Static Model Scanning with ModelAudit

Supply chain attacks through compromised models are a growing threat. We've significantly enhanced our static model security scanner to help you verify model integrity before deployment, checking for everything from malicious pickle files to subtle statistical anomalies that might indicate trojaned models.

**New Web Interface**: ModelAudit now includes a visual UI accessible at `/model-audit` when running `promptfoo view`:

- Visual file/directory selection with drag-and-drop support
- Real-time scanning progress with live updates
- Tabbed results display with severity color coding
- Scan history tracking

**Expanded Format Support**:

- **[SafeTensors](/docs/model-audit/scanners/#safetensors-scanner)** - Support for Hugging Face's secure tensor format
- **[HuggingFace URLs](/docs/model-audit/usage/#huggingface-url-scanning)** - Scan models directly from HuggingFace without downloading
- **Enhanced Binary Detection** - Automatic format detection for `.bin` files (PyTorch, SafeTensors, etc.)
- **Weight Analysis** - Statistical anomaly detection to identify potential backdoors

**Security Improvements**:

- Better detection of embedded executables (Windows PE, Linux ELF, macOS Mach-O)
- Path traversal protection in archives
- License compliance checking with SBOM generation
- Protection against zip bombs and decompression attacks

#### Developer Experience Improvements

- **Assertion Generation** - Automatically generate test assertions based on your use cases, saving time in test creation
- **SQLite WAL Mode** - Improved performance and reliability for local evaluations with better concurrent access
- **Enhanced Token Tracking** - Per-provider token usage statistics help you monitor costs across different LLM providers
- **Evaluation Time Limits** - New `PROMPTFOO_MAX_EVAL_TIME_MS` environment variable prevents runaway evaluations from consuming excessive resources
- **Custom Headers Support** - Added support for custom headers in Azure and Google Gemini providers for enterprise authentication needs
- **WebSocket Header Support** - Enhanced WebSocket providers with custom header capabilities

## Red Teaming

### Enterprise Features

#### Advanced Testing Capabilities for Teams

Generic attacks often miss system-specific vulnerabilities. We've added powerful features for organizations that need sophisticated AI security testing to create targeted tests that match your actual security risks:

1. **[Target Discovery Agent](/docs/red-team/discovery/)** - Automatically analyzes your AI system to understand its capabilities and craft more effective, targeted attacks

2. **[Custom Strategy Builder](/docs/red-team/strategies/custom-strategy/)** - Define complex multi-turn attack strategies using natural language instructions—no coding required

3. **[Grader Customization](/docs/red-team/troubleshooting/grading-results/#customizing-graders-for-specific-plugins-in-promptfoo-enterprise)** - Fine-tune evaluation criteria at the plugin level with concrete examples for more accurate assessments

4. **Cloud-based Plugin Severity Overrides** - Enterprise users can centrally manage and customize severity levels for red team plugins across their organization

### Plugins

#### Comprehensive Safety Testing for High-Stakes Domains

Different industries face unique AI risks. We've introduced specialized plugins for industries where AI errors have serious consequences, ensuring you're testing for the failures that matter most in your domain:

##### Medical Safety Testing

**[Medical Plugins](/docs/red-team/plugins/medical/)** detect critical healthcare risks:

- **Hallucination** - Fabricated medical studies or drug interactions
- **Prioritization Errors** - Dangerous mistakes in triage scenarios
- **Anchoring Bias** - Fixation on initial symptoms while ignoring critical information
- **Sycophancy** - Agreeing with incorrect medical assumptions from users

##### Financial Risk Detection

**[Financial Plugins](/docs/red-team/plugins/financial/)** identify domain-specific vulnerabilities:

- **Calculation Errors** - Mistakes in financial computations
- **Compliance Violations** - Regulatory breaches in advice or operations
- **Data Leakage** - Exposure of confidential financial information
- **Hallucination** - Fabricated market data or investment advice

##### Bias Detection Suite

Biased AI systems can perpetuate discrimination at scale. Our new [comprehensive bias detection](/docs/red-team/plugins/bias/) tests ensure your AI treats all users fairly and respectfully across:

- **Age** - Ageism in hiring, healthcare, or service recommendations
- **Disability** - Unfair assumptions about capabilities
- **Gender** - Role stereotypes and differential treatment
- **Race** - Ethnic stereotypes and discriminatory patterns

##### Enterprise-Grade Datasets

- **[Aegis Dataset](/docs/red-team/plugins/aegis/)** - NVIDIA's 26,000+ manually annotated interactions across 13 safety categories for comprehensive content safety testing

#### New Red Team Capabilities

##### Intent Plugin Enhancements

The [Intent (Custom Prompts) plugin](/docs/red-team/plugins/intent/) now supports JSON file uploads with nested arrays for multi-step attack sequences. The enhanced UI makes it easier to manage complex test scenarios.

##### Enhanced HTTP Provider Support

Red team tests now include automatic token estimation for HTTP providers, helping you track costs even with custom API integrations.

##### System Prompt Override Testing

A new [System Prompt Override plugin](/docs/red-team/plugins/system-prompt-override/) tests whether your LLM deployment is vulnerable to system instruction manipulation—a critical security flaw that could disable safety features.

### Strategies

#### Smarter Multi-Turn Attack Techniques

Real attacks rarely succeed in a single message. We've enhanced our attack strategies to better simulate how bad actors actually try to manipulate AI systems through extended, adaptive conversations:

1. **Enhanced [GOAT](/docs/red-team/strategies/goat/) and [Crescendo](/docs/red-team/strategies/multi-turn/)** - Now include intelligent agents that can:
   - Navigate multi-step verification processes
   - Respond to intermediate prompts like "confirm your account"
   - Handle conditional logic in conversations
   - Adapt strategies based on system responses

2. **[Emoji Encoding Strategy](/docs/red-team/strategies/other-encodings/#emoji-encoding)** - New obfuscation technique using emoji to bypass content filters
