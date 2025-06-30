---
slug: june-2025-roundup
title: June 2025 Roundup
description: Financial security testing, self-hosted Helicone gateway, mTLS support, and 300+ commits
authors: [promptfoo_team]
tags: [roundup, june-2025, financial, helicone, enterprise, aegis]
keywords: [financial security, Helicone AI Gateway, mTLS, documentation restructure, Aegis]
date: 2025-06-30T23:59
---

# June 2025 Roundup

June delivered 300+ commits with financial security testing, self-hosted gateway support, and enterprise security features.

<!-- truncate -->

## 🚀 Major Features

### Financial Security Suite

Comprehensive testing for financial AI systems:

```yaml
redteam:
  plugins:
    - financial
  purpose: 'Banking customer service chatbot'
```

Five specialized tests:

- **Data leakage** - PII/financial data exposure
- **Compliance** - GDPR, PCI DSS validation
- **Calculation errors** - Math accuracy testing
- **Hallucination** - Prevents incorrect advice
- **Sycophancy** - Detects inappropriate agreement

[Space for screenshot: Financial plugin results]

### Helicone AI Gateway

Self-hosted open-source gateway for unified LLM access:

```yaml
providers:
  - helicone:openai/gpt-4.1
  - helicone:anthropic/claude-4-sonnet
  - helicone:groq/llama-4-maverick
    config:
      baseUrl: "http://localhost:8787"  # Your gateway
```

**Key features:**

- Route to 100+ LLM providers
- Smart caching & rate limiting
- Local control over your data
- OpenAI-compatible interface

### Enterprise Security

mTLS support for production databases:

```yaml
database:
  ssl:
    enabled: true
    mtls: true
    ca: '/path/to/ca.pem'
    cert: '/path/to/client-cert.pem'
    key: '/path/to/client-key.pem'
```

## 🛡️ Red Team Enhancements

### Aegis Dataset

New comprehensive security testing dataset for advanced red team evaluations.

### Centralized Defaults

Consistent configuration across all red team tests:

```yaml
redteam:
  maxConcurrency: 10
  numTests: 100
  strategies:
    - multilingual
    - jailbreak
```

### Enhanced Grading

- Improved accuracy for all plugins
- Better cloud grading integration
- Enhanced debugging capabilities

## 🎯 Developer Experience

### OpenTelemetry Tracing

Enterprise observability with distributed tracing:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
npx promptfoo eval --tracing
```

### Assertion Generation

Automatically create test assertions:

```bash
npx promptfoo generate assertions --provider openai:gpt-4.1
```

### UI Improvements

- **Cell highlighting** - Click to highlight important results
- **Count display** - Shows highlighted cell counts
- **Evaluation time limits** - Set max runtime per eval

## 📊 Model Support

**New Models:**

- **GPT-4.1** - Latest OpenAI model
- **Claude 4 Sonnet** - Anthropic's newest
- **Llama 4 Maverick** - Via Helicone gateway
- **o4-mini** - Efficient reasoning model

**Provider Updates:**

- Hyperbolic multimodal support
- Enhanced Cloudflare integration
- Improved Azure content filtering
- Better SageMaker serialization

## 🔧 Quick Start

```bash
# Test financial security
npx promptfoo redteam --plugins financial

# Use Helicone gateway
npx helicone start  # Start local gateway
npx promptfoo eval --provider helicone:openai/gpt-4.1

# Enable tracing
npx promptfoo eval --tracing

# Generate assertions
npx promptfoo generate assertions
```

## 🐛 Bug Fixes & Performance

- Fixed undefined outputs in downloads
- Resolved organization settings styling
- Improved token usage tracking
- Better null output handling

## 📚 Documentation Updates

- Major config documentation restructure
- New HuggingFace datasets guide
- Self-hosting clarifications
- Offline environment FAQ

---

**[Full Changelog →](https://github.com/promptfoo/promptfoo/releases)**
