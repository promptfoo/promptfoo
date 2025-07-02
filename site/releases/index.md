---
slug: /
title: Release notes
description: Monthly summaries of promptfoo releases, features, and improvements
tags: [releases, changelog, updates, features]
keywords: [promptfoo releases, changelog, updates, features, monthly summaries]
---

# Release notes

Full release history for Promptfoo open source can be found on [GitHub](https://github.com/promptfoo/promptfoo/releases).

## June 2025 - Financial security & enterprise features

### Features
- [Financial security suite](/releases/features/financial-security) - Banking & compliance testing
- [Helicone AI Gateway](/releases/features/helicone-gateway) - Self-hosted LLM gateway
- [mTLS support](/releases/features/mtls-support) - Enterprise database security
- [Quick start](/releases/features/quick-start) - for financial security, Helicone gateway, tracing, and assertions
- Offline environment FAQ
- [OpenTelemetry tracing](/releases/features/opentelemetry) - Distributed observability
- [Assertion generation](/releases/features/assertion-generation) - Automated test case creation
- GPT-4.1 support across all providers, Claude 4 Sonnet integration, Llama 4 Maverick via Helicone gateway, and o4-mini reasoning model support.

#### Red teaming
- [Aegis dataset](/releases/features/aegis-dataset) - New comprehensive security testing dataset for advanced red team evaluations
- [Centralized defaults](/releases/features/centralized-defaults) - Consistent red team configuration

### Bug fixes and performance
- Fixed undefined outputs in downloads
- Improved token usage tracking
- Better null output handling


## May 2025 - Quality assurance tools

### Features
- [Target discovery agent](/releases/features/target-discovery) - AI-powered vulnerability detection
- [xAI integration](/releases/features/xai-integration) - Model context protocol support
- [Off-topic plugin](/releases/features/off-topic-plugin) - Focus validation for AI systems
- [Validation command](/releases/features/validation-command) - Configuration quality assurance
- Server-side pagination for handling thousands of eval results
- Enhanced data export with multiple formats and metadata
- Universal environment variables for configuration flexibility

#### Red teaming
- New security plugins: 
    - Off-topic detection - Ensures AI stays on task
    - MCP (Model Context Protocol) - Tests tool usage vulnerabilities
    - Gender bias - Detects discriminatory outputs
    - EU AI Act mappings - Compliance testing
- [Goal extraction](/releases/features/goal-extraction) - AI agents that discover system purpose without documentation
- Enhanced strategies: camelCase mutation strategy, improved jailbreak detection, better prompt extraction

#### Model providers
- Claude 4 support across Anthropic, AWS Bedrock, and Google Vertex AI
- Enhanced HTTP provider with comprehensive metadata support

## April 2025 - Advanced evaluation features

### Features
- [METEOR scoring](/releases/features/meteor-scoring) - Advanced text evaluation metrics
- [Cerebras integration](/releases/features/cerebras-provider) - High-performance AI model evaluation
- [Grok-3 support](/releases/features/grok-3-provider) - Advanced AI evaluation capabilities
- [DoNotAnswer plugin](/releases/features/donotanswer-plugin) - AI safety and refusal testing
- Performance improvements - 60% faster remote grading, parallel assertion processing, and optimized cache management
- New models added: GPT4.1, o3-mini & o4-mini, Grok 3, and Claude 3.7 Sonnet (improved)
- Model provider updates: Google Search grounding for Gemini, MCP (Model Context Protocol) support, enhanced Azure OpenAI integration

#### Red teaming
**Advanced Attack Strategies**
- Homoglyph attacks - Visual character spoofing
- Extended character encodings - Unicode bypass attempts
- XSTest plugin - Cross-site scripting detection
- ASCII smuggling - Encoding-based bypasses

**Enhanced Plugins**
- DoNotAnswer dataset integration
- XSTest for AI-specific XSS vulnerabilities
- Improved prompt extraction techniques
- Better jailbreak detection

### Bug fixes
- Fixed SQL extraction in analytics
- Resolved WebUI crash on certain configs
- Improved memory usage in large evaluations

## March 2025 - Multimodal security features

### Features
- [LiteLLM integration](/releases/features/2025-03-31-litellm-integration) - 100+ providers in a single interface
- [JSONL support](/releases/features/2025-03-31-jsonl-support) - Large-scale evaluations
- [Foundation model testing](/releases/features/2025-03-31-foundation-model-testing) - Transformer-based model testing
- Performance: Improved caching system (45% faster evals) and better memory management for large datasets

#### Red teaming
- Fuzzing & mutation strategies: camelCase (tests case-sensitive parsing), dateFormatter (probes date/time vulnerabilities),and mathInjection (tests numeric overflows).
- [Purpose discovery](/releases/features/purpose-discovery) - AI agent automatic system capability discovery

### Bug fixes:
- Fixed console.log encoding issues