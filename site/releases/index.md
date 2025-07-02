---
slug: /
title: Release notes
description: Monthly summaries of promptfoo releases, features, and improvements
tags: [releases, changelog, updates, features]
keywords: [promptfoo releases, changelog, updates, features, monthly summaries]
---

# Release notes

Full release history for Promptfoo open source can be found on [GitHub](https://github.com/promptfoo/promptfoo/releases).

<!-- truncate -->

## June 2025 - Financial security & enterprise features

### Promptfoo (Core / Eval) 

- [Helicone AI Gateway](https://www.promptfoo.dev/docs/providers/helicone/) provider added
- [Hyperbolic image and audio providers](https://www.promptfoo.dev/docs/providers/hyperbolic/) support added
- Provider support: Mistral Magistral reasoning models, Gemini models include latest 2.5 Pro Preview and Flash
- Tracing for agents!! Promptfoo [collects OpenTelemetry data](/docs/tracing/) and displays it in the UI. Less external observability infrastructure - excellent
- Performance: Better handling for large high concurrency evals
- Model audit: Support for every major ML format and dashboard in Promptfoo

### Red team

- Multi-turn redteam strategies are smarter and can answer questions like “Pick A or B” before continuing attack
- [Unblock multiturn](/docs/red-team/strategies/multi-turn/) added
- [Financial plugins](/docs/red-team/plugins/financial/) added
- [Bias plugins](/docs/red-team/plugins/gender-bias/) added
- defaultTest variables to red team setup UI added

## May 2025 - Quality assurance tools

### Features
- Target discovery agent - AI-powered vulnerability detection
- xAI integration - Model context protocol support
- Off-topic plugin - Focus validation for AI systems
- Validation command - Configuration quality assurance
- Server-side pagination for handling thousands of eval results
- Enhanced data export with multiple formats and metadata
- Universal environment variables for configuration flexibility

#### Red teaming
- New security plugins: 
    - Off-topic detection - Ensures AI stays on task
    - MCP (Model Context Protocol) - Tests tool usage vulnerabilities
    - Gender bias - Detects discriminatory outputs
    - EU AI Act mappings - Compliance testing
- Goal extraction - AI agents that discover system purpose without documentation
- Enhanced strategies: camelCase mutation strategy, improved jailbreak detection, better prompt extraction

#### Model providers
- Claude 4 support across Anthropic, AWS Bedrock, and Google Vertex AI
- Enhanced HTTP provider with comprehensive metadata support

## April 2025 - Advanced evaluation features

### Features
- METEOR scoring - Advanced text evaluation metrics
- Cerebras integration - High-performance AI model evaluation
- Grok-3 support - Advanced AI evaluation capabilities
- DoNotAnswer plugin - AI safety and refusal testing
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
- LiteLLM integration - 100+ providers in a single interface
- JSONL support - Large-scale evaluations
- Foundation model testing - Transformer-based model testing
- Performance: Improved caching system (45% faster evals) and better memory management for large datasets

#### Red teaming
- Fuzzing & mutation strategies: camelCase (tests case-sensitive parsing), dateFormatter (probes date/time vulnerabilities),and mathInjection (tests numeric overflows).
- Purpose discovery - AI agent automatic system capability discovery

### Bug fixes:
- Fixed console.log encoding issues