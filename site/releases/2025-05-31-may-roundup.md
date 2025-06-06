---
slug: may-2025-roundup
title: May 2025 Roundup - Quality Assurance Tools
description: Six releases featuring xAI integration, target discovery agents, validation tooling, and new red team capabilities
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

# May 2025 Roundup - Quality Assurance Tools

May 2025 included **6 major releases** (v0.113.2 → v0.114.2) that added AI safety, eval tooling, and developer experience improvements. The releases include target discovery agents, xAI integration, and validation tools.

<!-- truncate -->

:::info May 2025 Highlights

This month added the **target discovery agent** and **validation command** for AI safety testing and quality assurance.

:::

## 📊 May 2025 By The Numbers

- **6 Major Releases** (v0.113.2 → v0.114.2)
- **3 New Model Providers** (xAI, Claude 4 expansion)
- **5 New Red Team Capabilities** (Target discovery, off-topic testing, goal-based attacks)
- **2 Performance Improvements** (Server-side pagination, enhanced exports)
- **1 New Tool** (Validation command)

## 🚀 New Features

### 🎯 Target Discovery Agent (v0.114.1)

Added intelligent target discovery agent that automatically discovers and analyzes targets for red team testing:

```yaml
redteam:
  plugins:
    - target-discovery
  strategies:
    - crescendo
    - goat
  purpose: 'Test e-commerce chatbot for vulnerabilities'
```

:::tip

This AI-powered system improves test coverage and effectiveness by intelligently identifying potential vulnerability points.

:::

### 🌐 xAI Integration & Model Context Protocol (v0.114.0, v0.114.1)

Added xAI integration with image provider and live search support, plus Model Context Protocol (MCP) support for OpenAI:

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

### ⚡ Validation Command (v0.114.0)

Added new command for quality assurance that validates configurations before running evals:

```bash
npx promptfoo@latest validate
```

Use this tool to catch configuration issues before they cause problems and improve developer confidence.

## 🛡️ Red Team Capabilities

### 🎯 Off-Topic Testing (v0.114.2)

New plugin to test if AI systems stay focused and avoid being led into unrelated conversations:

```yaml
redteam:
  plugins:
    - off-topic
  purpose: 'Test customer service chatbot'
```

### 🎯 Goal-Based Attacks (v0.114.2)

New approach allowing security teams to set specific goals for red team attacks:

```yaml
redteam:
  strategies:
    - goal-based
  goals:
    - 'Extract personal information'
    - 'Bypass content filters'
```

:::warning

Goal-based attacks enable focused security testing by allowing teams to specify exact objectives for red team operations.

:::

### 🧠 Enhanced Intent Processing (v0.113.2, v0.113.3)

Improvements to intent grading and gender bias detection for more accurate and fair eval.

## 🔧 Developer Experience

### ⚡ Server-Side Pagination (v0.113.4)

Performance improvement enabling handling of thousands of eval results with smooth UI interactions:

- Improved performance for large datasets
- Enhanced filtering capabilities
- Better search across results
- Improved scalability for enterprise use

### 📊 Enhanced Data Export (v0.113.4, v0.114.2)

Improvements to data analysis capabilities:

```bash
# Multiple export formats with rich metadata
npx promptfoo@latest export --format csv --include-scores
npx promptfoo@latest export --format json
```

- Pass/fail scoring in CSV exports
- JSON download options
- Plugin and strategy IDs for better traceability
- More detailed export options for external analysis

### 🌍 Universal Environment Variables (v0.114.0)

Added complete flexibility in configuration management:

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

Added Claude 4 support across three major cloud providers:

- Anthropic direct
- AWS Bedrock
- Google Vertex AI

### 🚀 Enhanced HTTP Provider (v0.114.1)

Added comprehensive metadata support for better debugging:

```yaml
providers:
  - http://localhost:8080/api/chat
    config:
      includeMetadata: true
```

Raw output, status codes, and response metadata now included for enhanced analysis.

## 🐛 Fixes & Stability

### 🔧 Core Infrastructure (v0.113.2, v0.113.3)

- Intent grader fixes for better eval accuracy
- Zod error handling improvements
- Red team file loading from cloud configurations
- Gender bias plugin accuracy improvements
- Environment variable resolution fixes

### 🔄 Telemetry & Performance (v0.113.2)

- Telemetry rollback for stable data collection
- Comprehensive dependency updates
- Enhanced build reliability

## 📦 Getting Started

Install the latest version:

```bash
npm install -g promptfoo@latest
```

Or use with npx:

```bash
npx promptfoo@latest eval
npx promptfoo@latest validate
npx promptfoo@latest scan-model
```

## 🔗 See Also

- [Target Discovery Guide](/docs/red-team/discovery/)
- [xAI Provider Documentation](/docs/providers/xai/)
- [Validation Command Reference](/docs/usage/command-line/#promptfoo-validate)
- [Server-Side Features](/docs/usage/web-ui/#performance)
- [Goal-Based Testing](/docs/red-team/strategies/)

---

May 2025 added AI safety testing capabilities and quality assurance tools to promptfoo. These features help make AI systems safer, more reliable, and easier to evaluate at scale.

Share your experience with the new features on [Discord](https://discord.gg/promptfoo) or [GitHub](https://github.com/promptfoo/promptfoo).

---

**Previous Roundups**: [April 2025](/releases/april-2025-roundup) • [March 2025](/releases/march-2025-roundup)  
**Next**: June 2025 Roundup (coming soon)
