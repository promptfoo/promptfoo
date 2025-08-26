---
title: Release Notes
sidebar_position: 100
description: Track monthly Promptfoo releases featuring new providers, security plugins, performance improvements, and community contributions
tags: [releases, changelog, updates, features]
keywords: [Promptfoo releases, changelog, updates, features, monthly summaries]
---

# Release Notes

Full release history for Promptfoo open source can be found on [GitHub](https://github.com/promptfoo/promptfoo/releases).

## July 2025 Release Highlights {#july-2025}

This month we focused on expanding **provider support**, enhancing **evaluation capabilities**, and strengthening **enterprise features** to help you build more reliable and secure AI applications.

### Evals

#### New Models / Providers {#july-2025-providers}

##### Expanded Provider Support

- **[Docker Model Runner](/docs/providers/docker/)** - Run models in isolated Docker containers for better security and reproducibility
- **[MCP (Model Context Protocol)](/docs/providers/mcp/)** - Connect to MCP servers for enhanced AI capabilities
- **[Google Imagen](/docs/providers/google/#image-generation-models)** - Generate images for multimodal testing scenarios
- **[AIMLAPI](/docs/providers/aimlapi/)** - Access various AI models through a unified interface

##### New Model Support

- **[Grok-4](/docs/providers/xai/)** - Advanced reasoning capabilities from xAI
- **OpenAI Deep Research Models** - [o3-deep-research and o4-mini-deep-research](/docs/providers/openai/#deep-research-models-responses-api-only) for complex problem solving
- **Enhanced Azure Provider** - Added system prompt support for better control

##### Enhanced Capabilities

- **[LiteLLM Embeddings](/docs/providers/litellm/#embedding-configuration)** - Similarity testing and semantic search
- **[Google Vision](/docs/providers/google/#chat-and-multimodal-models)** - Image understanding for multimodal evaluations
- **HTTP Provider Enhancements** - Added support for [JKS](/docs/providers/http/#jks-java-keystore-certificates) and [PFX](/docs/providers/http/#pfx-personal-information-exchange-certificates) client certificates.
- **[Browser Provider](/docs/providers/browser/)** - Connect to existing Chrome browser sessions via Chrome DevTools Protocol (CDP) for testing OAuth-authenticated applications

#### Assertion Improvements {#july-2025-assertions}

- **Context Transforms**: Extract additional data from provider responses to use in assertions: [context-based assertions](/docs/configuration/expected-outputs/model-graded/#dynamically-via-context-transform). These are especially useful for evaluating RAG systems.
- **Finish Reason Validation**: Use [finish-reason](/docs/configuration/expected-outputs/deterministic/#finish-reason) as an option in assertions to validate how AI model responses are terminated. This is useful for checking if the model completed naturally, hit token limits, triggered content filters, or made tool calls as expected.
- **Tracing Assertions**: Use your tracing and telemetry data in assertions: [trace-span-count](/docs/configuration/expected-outputs/deterministic/#trace-span-count), [trace-span-duration](/docs/configuration/expected-outputs/deterministic/#trace-span-duration), and [trace-error-spans](/docs/configuration/expected-outputs/deterministic/#trace-error-spans)

#### Other Features {#july-2025-other}

- **External Test Configuration** - defaultTest can now load test cases from external files for easier management

#### Developer Experience Improvements {#july-2025-dev-experience}

- **Python Debugging** - Use `import pdb; pdb.set_trace()` in executed third-party Python scripts for easier debugging
- **Enhanced Search** - Comprehensive metadata filtering to search results with search operators (equals, contains, not contains) and persistent button actions

#### Web UI Improvements {#july-2025-web-ui}

##### Enhanced Eval Results Page

We've significantly improved the evaluation results interface to handle large-scale testing more effectively:

- **First-Class Zooming Support** - Zoom in and out of the eval results table to see more data at once or focus on specific details. This is especially useful when working with evaluations containing hundreds or thousands of test cases.

- **Advanced Metadata Filtering** - Filter results using powerful search operators (equals, contains, not contains) with persistent button actions. Click on any metric pill in the results to instantly apply it as a filter, making it easier to drill down into specific failure modes or success patterns.

- **Improved Pagination** - Enhanced pagination controls with "go to" functionality and better handling of large result sets. The UI now maintains scroll position and filter state as you navigate between pages.

- **Multi-Metric Filtering** - Apply multiple filters simultaneously to find exactly the results you're looking for. For red team evaluations, you can now filter by both plugin and strategy to analyze specific attack vectors.

- **Performance Optimizations** - Fixed horizontal scrolling issues, improved rendering performance for large tables, and optimized memory usage when dealing with extensive evaluation results.

These improvements make it much easier to analyze and understand evaluation results, especially for large-scale red teaming exercises or comprehensive test suites.

### Red Teaming

#### Enterprise Features {#july-2025-enterprise}

- **Regrade Red Team Scans** - After adding grading rules, re-grade existing scans without re-running them. Once you've changed a grading system (pass/fail criteria, reasoning, etc.) you can re-grade existing eval results to measure the effect of those changes.
- **Identity Provider Integration** - Map teams and roles from your Identity Provider to automatically assign permissions
- **MCP Proxy** - Enterprise-grade security for MCP servers with access control and traffic monitoring for sensitive data

#### Strategies {#july-2025-strategies}

##### New Agentic Multi-Turn Strategies

We've launched two powerful new agentic multi-turn red team strategies that adapt dynamically based on target responses:

- **[Custom Strategy](/docs/red-team/strategies/custom-strategy/)** - Define your own red teaming strategies using natural language instructions. This groundbreaking feature lets you create sophisticated, domain-specific attack patterns without writing code. The AI agent interprets your instructions and executes multi-turn conversations tailored to your specific testing needs.

- **[Mischievous User Strategy](/docs/red-team/strategies/mischievous-user/)** - Simulates an innocently mischievous user who plays subtle games with your AI agent through multi-turn conversations. This strategy uncovers vulnerabilities by mimicking real-world user behavior where users might push boundaries through playful or indirect approaches rather than direct attacks.

Both strategies leverage AI agents to conduct intelligent, adaptive conversations that evolve based on your system's responses, making them far more effective than static attack patterns.

##### Other Strategy Improvements

- **HTTP Target Improvements** - Enhanced test button now provides detailed error diagnostics, automatic retry suggestions, and context-aware fixes for common configuration issues like authentication failures, CORS errors, and malformed requests

### See Also {#july-2025-see-also}

- [GitHub Releases](https://github.com/promptfoo/promptfoo/releases)
- [Tracing](/docs/tracing/)
- [Red Team Strategies](/docs/red-team/strategies/)
- [Provider Configuration](/docs/providers/)

---

## June 2025 Release Highlights {#june-2025}

This month we focused on enhancing **observability**, expanding **provider support**, and strengthening **red team capabilities** to help you build more reliable and secure AI applications.

### Evals

#### Tracing {#june-2025-tracing}

##### See Inside Your LLM Applications with OpenTelemetry

We've added [OpenTelemetry tracing support](/docs/tracing/) to help you understand what's happening inside your AI applications. Previously, LLM applications were often "black boxes"—you could see inputs and outputs, but not what happened in between. Now you can visualize the entire execution flow, measure performance of individual steps, and quickly identify issues.

![Tracing and OpenTelemetry Support](/img/docs/trace.png)

This is especially valuable for complex RAG pipelines or multi-step workflows where you need to identify performance bottlenecks or debug failures.

**Use it when:**

- Debugging slow RAG pipelines
- Optimizing multi-step agent workflows
- Understanding why certain requests fail
- Measuring performance across different providers

#### New Models / Providers {#june-2025-providers}

##### Expanded Audio and Multimodal Capabilities

As AI applications increasingly use voice interfaces and visual content, you need tools to evaluate these capabilities just as rigorously as text-based interactions. We've significantly expanded support for audio and multimodal AI:

1. **[Google Live Audio](/docs/providers/google/#audio-generation)** - Full audio generation with features like:
   - Voice selection and customization
   - Affective dialog for more natural conversations
   - Real-time transcription
   - Support for Gemini 2.0 Flash and native audio models

2. **[Hyperbolic Provider](/docs/providers/hyperbolic/)** - New support for Hyperbolic's image and audio models, providing more options for multimodal evaluations

3. **[Helicone AI Gateway](/docs/providers/helicone/)** - Route requests through Helicone for enhanced monitoring and analytics

4. **Mistral Magistral** - Added support for Mistral's latest reasoning models

#### Other Features {#june-2025-other}

##### Static Model Scanning with ModelAudit

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

##### Developer Experience Improvements {#june-2025-dev-experience}

- **Assertion Generation** - Automatically generate test assertions based on your use cases, saving time in test creation
- **SQLite WAL Mode** - Improved performance and reliability for local evaluations with better concurrent access
- **Enhanced Token Tracking** - Per-provider token usage statistics help you monitor costs across different LLM providers
- **Evaluation Time Limits** - New `PROMPTFOO_MAX_EVAL_TIME_MS` environment variable prevents runaway evaluations from consuming excessive resources
- **Custom Headers Support** - Added support for custom headers in Azure and Google Gemini providers for enterprise authentication needs
- **WebSocket Header Support** - Enhanced WebSocket providers with custom header capabilities

### Red Teaming

#### Enterprise Features {#june-2025-enterprise}

##### Advanced Testing Capabilities for Teams

Generic attacks often miss system-specific vulnerabilities. We've added powerful features for organizations that need sophisticated AI security testing to create targeted tests that match your actual security risks:

1. **[Target Discovery Agent](/docs/red-team/discovery/)** - Automatically analyzes your AI system to understand its capabilities and craft more effective, targeted attacks

2. **[Adaptive Red Team Strategies](/docs/red-team/strategies/)** - Define complex multi-turn attack strategies with enhanced capabilities for targeted testing

3. **[Grader Customization](/docs/red-team/troubleshooting/grading-results/#customizing-graders-for-specific-plugins-in-promptfoo-enterprise)** - Fine-tune evaluation criteria at the plugin level with concrete examples for more accurate assessments

4. **Cloud-based Plugin Severity Overrides** - Enterprise users can centrally manage and customize severity levels for red team plugins across their organization

#### Plugins {#june-2025-plugins}

##### Comprehensive Safety Testing for High-Stakes Domains

Different industries face unique AI risks. We've introduced specialized plugins for industries where AI errors have serious consequences, ensuring you're testing for the failures that matter most in your domain:

#### Medical Safety Testing

**[Medical Plugins](/docs/red-team/plugins/medical/)** detect critical healthcare risks:

- **Hallucination** - Fabricated medical studies or drug interactions
- **Prioritization Errors** - Dangerous mistakes in triage scenarios
- **Anchoring Bias** - Fixation on initial symptoms while ignoring critical information
- **Sycophancy** - Agreeing with incorrect medical assumptions from users

#### Financial Risk Detection

**[Financial Plugins](/docs/red-team/plugins/financial/)** identify domain-specific vulnerabilities:

- **Calculation Errors** - Mistakes in financial computations
- **Compliance Violations** - Regulatory breaches in advice or operations
- **Data Leakage** - Exposure of confidential financial information
- **Hallucination** - Fabricated market data or investment advice

#### Bias Detection Suite

Biased AI systems can perpetuate discrimination at scale. Our new [comprehensive bias detection](/docs/red-team/plugins/bias/) tests ensure your AI treats all users fairly and respectfully across:

- **Age** - Ageism in hiring, healthcare, or service recommendations
- **Disability** - Unfair assumptions about capabilities
- **Gender** - Role stereotypes and differential treatment
- **Race** - Ethnic stereotypes and discriminatory patterns

#### Enterprise-Grade Datasets

- **[Aegis Dataset](/docs/red-team/plugins/aegis/)** - NVIDIA's 26,000+ manually annotated interactions across 13 safety categories for comprehensive content safety testing

#### New Red Team Capabilities

##### Intent Plugin Enhancements

The [Intent (Custom Prompts) plugin](/docs/red-team/plugins/intent/) now supports JSON file uploads with nested arrays for multi-step attack sequences. The enhanced UI makes it easier to manage complex test scenarios.

##### Enhanced HTTP Provider Support

Red team tests now include automatic token estimation for HTTP providers, helping you track costs even with custom API integrations.

##### System Prompt Override Testing

A new [System Prompt Override plugin](/docs/red-team/plugins/system-prompt-override/) tests whether your LLM deployment is vulnerable to system instruction manipulation—a critical security flaw that could disable safety features.

### See Also {#june-2025-see-also}

- [GitHub Releases](https://github.com/promptfoo/promptfoo/releases)
- [OpenTelemetry Tracing](/docs/tracing/)
- [Medical & Financial Plugins](/docs/red-team/plugins/)
- [Model Audit](/docs/model-audit/)

---

#### Strategies {#june-2025-strategies}

##### Smarter Multi-Turn Attack Techniques

Real attacks rarely succeed in a single message. We've enhanced our attack strategies to better simulate how bad actors actually try to manipulate AI systems through extended, adaptive conversations:

1. **Enhanced [GOAT](/docs/red-team/strategies/goat/) and [Crescendo](/docs/red-team/strategies/multi-turn/)** - Now include intelligent agents that can:
   - Navigate multi-step verification processes
   - Respond to intermediate prompts like "confirm your account"
   - Handle conditional logic in conversations
   - Adapt strategies based on system responses

2. **[Emoji Encoding Strategy](/docs/red-team/strategies/other-encodings/#emoji-encoding)** - New obfuscation technique using emoji to bypass content filters

### See Also {#june-2025-see-also}

- [GitHub Releases](https://github.com/promptfoo/promptfoo/releases)
- [OpenTelemetry Tracing](/docs/tracing/)
- [Medical & Financial Plugins](/docs/red-team/plugins/)
- [Model Audit](/docs/model-audit/)
