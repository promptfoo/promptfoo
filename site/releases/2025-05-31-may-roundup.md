---
slug: may-2025-roundup
title: May 2025 Roundup - A Month of Major Breakthroughs
description: Six releases featuring xAI integration, target discovery agents, validation tooling, and groundbreaking red team capabilities
authors: [promptfoo_team]
tags: [roundup, may-2025, xai, target-discovery, validation, red-team, monthly-summary]
keywords:
  [
    xAI,
    target discovery,
    validation command,
    off-topic testing,
    goal-based attacks,
    server-side pagination,
  ]
date: 2025-05-31T23:59
---

# May 2025 Roundup: A Month of Major Breakthroughs

May 2025 was an extraordinary month for promptfoo, with **6 major releases** that introduced groundbreaking capabilities across AI safety, eval tooling, and developer experience. From revolutionary target discovery agents to xAI integration, let's dive into the month's most significant innovations.

<!-- truncate -->

:::info May 2025 Highlights

This month introduced the **target discovery agent** and **validation command** - two game-changing capabilities that revolutionized AI safety testing and quality assurance.

:::

## 📊 May 2025 By The Numbers

- **6 Major Releases** (v0.113.2 → v0.114.2)
- **3 New Model Providers** (xAI, Claude 4 expansion)
- **5 New Red Team Capabilities** (Target discovery, off-topic testing, goal-based attacks)
- **2 Major Performance Improvements** (Server-side pagination, enhanced exports)
- **1 Revolutionary Tool** (Validation command)

## 🚀 Breakthrough Innovations

### 🎯 Target Discovery Agent (v0.114.1)

The crown jewel of May's releases was the **intelligent target discovery agent** - a game-changing capability that automatically discovers and analyzes targets for red team testing.

```yaml
redteam:
  plugins:
    - target-discovery
  strategies:
    - crescendo
    - goat
  purpose: 'Test e-commerce chatbot for vulnerabilities'
```

:::tip AI-Powered Security

This AI-powered system improves test coverage and effectiveness by intelligently identifying potential vulnerability points, making red teaming more systematic and comprehensive.

:::

### 🌐 xAI Integration & Model Context Protocol (v0.114.0, v0.114.1)

May saw the introduction of **xAI integration** with image provider and live search support, plus groundbreaking **Model Context Protocol (MCP)** support for OpenAI:

```yaml
providers:
  - xai:image-model
  - xai:search-enhanced-model
  - openai:gpt-4
    config:
      mcp: true
      tools:
        - name: "search_tool"
          protocol: "mcp"
```

### ⚡ Validation Command - Prevention Over Reaction (v0.114.0)

A completely new approach to quality assurance with the **validate command**:

```bash
# Catch configuration issues before they cause problems
npx promptfoo@latest validate
```

This tool validates configurations before running evals, preventing costly mistakes and improving developer confidence.

## 🛡️ Advanced Red Team Capabilities

### 🎯 Off-Topic Testing (v0.114.2)

New plugin to test if AI systems stay focused and avoid being led into unrelated conversations:

```yaml
redteam:
  plugins:
    - off-topic
  purpose: 'Test customer service chatbot'
```

### 🎯 Goal-Based Attacks (v0.114.2)

Revolutionary approach allowing security teams to set specific goals for red team attacks:

```yaml
redteam:
  strategies:
    - goal-based
  goals:
    - 'Extract personal information'
    - 'Bypass content filters'
```

:::warning Advanced Attack Strategies

Goal-based attacks enable focused security testing by allowing teams to specify exact objectives for red team operations.

:::

### 🧠 Enhanced Intent Processing (v0.113.2, v0.113.3)

Critical improvements to intent grading and gender bias detection, making eval more accurate and fair.

## 🔧 Developer Experience Revolution

### ⚡ Server-Side Pagination (v0.113.4)

A massive performance breakthrough enabling handling of **thousands of eval results** with smooth UI interactions:

- Dramatic performance improvement for large datasets
- Advanced filtering capabilities
- Enhanced search across results
- Better scalability for enterprise use

### 📊 Enhanced Data Export (v0.113.4, v0.114.2)

Comprehensive improvements to data analysis capabilities:

```bash
# Multiple export formats with rich metadata
npx promptfoo@latest export --format csv --include-scores
npx promptfoo@latest export --format json
```

- **Pass/fail scoring** in CSV exports
- **JSON download** options
- **Plugin and strategy IDs** for better traceability
- More detailed export options for external analysis

### 🌍 Universal Environment Variables (v0.114.0)

Complete flexibility in configuration management:

```yaml title="promptfooconfig.yaml"
env:
  OPENAI_API_KEY: "custom-override"
  CUSTOM_ENDPOINT: "https://api.example.com"
providers:
  - openai:gpt-4
    config:
      apiKey: ${OPENAI_API_KEY}
```

## 🤖 Model Provider Expansion

### 🔮 Claude 4 Support (v0.114.0)

Added Claude 4 support across **three major cloud providers**:

- Anthropic direct
- AWS Bedrock
- Google Vertex AI

### 🚀 Enhanced HTTP Provider (v0.114.1)

Comprehensive metadata support for better debugging:

```yaml
providers:
  - http://localhost:8080/api/chat
    config:
      includeMetadata: true
```

Raw output, status codes, and response metadata now included for enhanced analysis.

## 🐛 Critical Stability Improvements

### 🔧 Core Infrastructure (v0.113.2, v0.113.3)

- **Intent grader fixes** for better eval accuracy
- **Zod error handling** improvements
- **Red team file loading** from cloud configurations
- **Gender bias plugin** accuracy improvements
- **Environment variable resolution** fixes

### 🔄 Telemetry & Performance (v0.113.2)

- Telemetry rollback for stable data collection
- Comprehensive dependency updates
- Enhanced build reliability

## 📦 Get Started

Experience all of May's innovations:

```bash
npm install -g promptfoo@latest
```

Or use with npx:

```bash
npx promptfoo@latest eval
npx promptfoo@latest validate
npx promptfoo@latest model-scan
```

## 🔗 See Also

- [Target Discovery Guide](/docs/red-team/discovery/)
- [xAI Provider Documentation](/docs/providers/xai/)
- [Validation Command Reference](/docs/usage/validation/)
- [Server-Side Features](/docs/usage/web-ui/#performance)
- [Goal-Based Testing](/docs/red-team/strategies/)

---

May 2025 demonstrated promptfoo's commitment to pushing the boundaries of AI eval and safety. With 6 major releases introducing revolutionary capabilities, the platform continues to lead the way in making AI systems safer, more reliable, and easier to evaluate at scale.

**What's your favorite May 2025 feature?** Join the discussion on [Discord](https://discord.gg/promptfoo) or [GitHub](https://github.com/promptfoo/promptfoo).

---

**Previous Roundups**: [April 2025](/releases/april-2025-roundup) • [March 2025](/releases/march-2025-roundup)  
**Next**: June 2025 Roundup (coming soon)
