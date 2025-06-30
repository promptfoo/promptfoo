---
slug: april-2025-roundup
title: April 2025 Roundup
description: METEOR scoring, Cerebras inference, advanced red team strategies, and 200+ commits
authors: [promptfoo_team]
tags: [roundup, april-2025, meteor, cerebras, homoglyph, donotanswer]
keywords: [METEOR scoring, Cerebras, homoglyph attacks, DoNotAnswer, XSTest, GPT-4.1]
date: 2025-04-30T23:59
---

# April 2025 Roundup

April delivered 200+ commits with new evaluation metrics, high-performance inference, and advanced security testing.

<!-- truncate -->

## 🚀 Major Features

### METEOR Scoring

Advanced text similarity metric beyond simple string matching:

```yaml
assert:
  - type: llm-rubric
    provider: openai:gpt-4.1
    rubric: meteor
    threshold: 0.9
```

### Cerebras Provider

Blazing fast inference with Llama 4 models:

```yaml
providers:
  - cerebras:llama-4-scout
  - cerebras:llama-4-maverick
```

### DoNotAnswer Plugin

Tests inappropriate content handling:

```yaml
redteam:
  plugins:
    - donotanswer
  purpose: 'Customer service chatbot'
```

[Space for screenshot: DoNotAnswer results]

## 🛡️ Red Team Enhancements

### Advanced Attack Strategies

- **Homoglyph attacks** - Visual character spoofing
- **Extended character encodings** - Unicode bypass attempts
- **XSTest plugin** - Cross-site scripting detection
- **ASCII smuggling** - Encoding-based bypasses

### Enhanced Plugins

- DoNotAnswer dataset integration
- XSTest for AI-specific XSS vulnerabilities
- Improved prompt extraction techniques
- Better jailbreak detection

## 🎯 Developer Experience

### Validation Command

Pre-flight checks before evaluation:

```bash
npx promptfoo validate
```

### Performance Improvements

- 60% faster remote grading
- Parallel assertion processing
- Optimized cache management

### UI Enhancements

- Dataset selection dropdown
- Improved result filtering
- Better error messaging

## 📊 Model Support

**New Models:**

- **GPT-4.1** - Enhanced reasoning (April 14 release)
- **o3-mini & o4-mini** - Efficient reasoning models
- **Grok 3** - xAI's latest model
- **Claude 3.7 Sonnet** - Improved capabilities

**Provider Updates:**

- Google Search grounding for Gemini
- MCP (Model Context Protocol) support
- Enhanced Azure OpenAI integration

## 🔧 Quick Start

```bash
# Test with new models
npx promptfoo eval --provider openai:gpt-4.1,openai:o4-mini

# Use Cerebras for fast inference
npx promptfoo eval --provider cerebras:llama-4-maverick

# Run security tests
npx promptfoo redteam --plugins donotanswer,xstest
```

## 🐛 Bug Fixes & Performance

- Fixed SQL extraction in analytics
- Resolved WebUI crash on certain configs
- Improved memory usage in large evaluations
- Better handling of Unicode in outputs

---

**[Full Changelog →](https://github.com/promptfoo/promptfoo/releases)**
