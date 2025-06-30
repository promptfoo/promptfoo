---
slug: may-2025-roundup
title: May 2025 Roundup
description: AI testing agents, xAI integration, off-topic detection, and 250+ commits
authors: [promptfoo_team]
tags: [roundup, may-2025, target-discovery, xai, off-topic, validation]
keywords: [target discovery, xAI, MCP, off-topic testing, validation command, Claude 4]
date: 2025-05-31T23:59
---

# May 2025 Roundup

May delivered 250+ commits with AI-powered testing agents, new provider integrations, and enhanced security capabilities.

<!-- truncate -->

## 🚀 Major Features

### Target Discovery Agent

AI automatically discovers your application's capabilities:

```yaml
redteam:
  strategies:
    - target-discovery
  purpose: 'E-commerce assistant'
```

The agent autonomously probes your system to uncover hidden features and attack surfaces.

[Space for screenshot: Target Discovery UI]

### xAI Provider Integration

Native support for Grok models:

```yaml
providers:
  - xai:grok-3
  - xai:grok-3-mini
    config:
      temperature: 0.1
```

### Off-Topic Plugin

Detects when AI strays from intended purpose:

```yaml
redteam:
  plugins:
    - off-topic
  purpose: 'Financial advisor chatbot'
```

## 🛡️ Red Team Enhancements

### New Security Plugins

- **Off-topic detection** - Ensures AI stays on task
- **MCP (Model Context Protocol)** - Tests tool usage vulnerabilities
- **Gender bias** - Detects discriminatory outputs
- **EU AI Act mappings** - Compliance testing

### Goal Extraction

AI agents that discover system purpose without documentation:

```yaml
redteam:
  goalExtraction:
    enabled: true
    maxIterations: 10
```

### Enhanced Strategies

- camelCase mutation strategy
- Improved jailbreak detection
- Better prompt extraction

## 🎯 Developer Experience

### Validation Command

Pre-flight configuration checks:

```bash
npx promptfoo validate
✓ Config file valid
✓ All providers accessible
✓ Test cases properly formatted
```

### UI Improvements

- File upload support for configs
- Enhanced result table features
- Better error messaging
- Improved navigation

### Performance

- 50% faster evaluation startup
- Optimized memory usage
- Better caching strategies

## 📊 Model Support

**New Models:**

- **Claude 4 Sonnet** - Released May 22
- **Grok 3 & 3-mini** - xAI's latest models
- **Llama 4 Scout** - 10M context window
- **DeepSeek-V3** - Cost-effective reasoning

**Provider Updates:**

- xAI native integration
- Enhanced Azure support
- Improved OpenRouter catalog
- Better error handling

## 🔧 Quick Start

```bash
# Discover system capabilities
npx promptfoo redteam --strategies target-discovery

# Test with Claude 4
npx promptfoo eval --provider anthropic:claude-4-sonnet

# Check for off-topic responses
npx promptfoo redteam --plugins off-topic

# Validate before running
npx promptfoo validate && npx promptfoo eval
```

## 🐛 Bug Fixes & Performance

- Fixed memory leaks in large evaluations
- Resolved Unicode handling issues
- Improved provider timeout handling
- Better WebUI stability

## 📚 Documentation

- New target discovery guide
- Updated provider documentation
- Enhanced red team tutorials
- Improved API reference

---

**[Full Changelog →](https://github.com/promptfoo/promptfoo/releases)**
