---
slug: april-2025-roundup
title: April 2025 Roundup - Advanced Evaluation Features
description: METEOR & GLEU metrics, Cerebras & Grok-3 providers, DoNotAnswer & XSTest plugins, and GPT-4.1 grading improvements
authors: [promptfoo_team]
tags: [roundup, april-2025, meteor, gleu, cerebras, grok-3, donotanswer, xstest, monthly-summary]
keywords:
  [METEOR, GLEU, Cerebras, Grok-3, DoNotAnswer, XSTest, GPT-4.1, homoglyph, evaluation metrics]
date: 2025-04-30T23:59
---

# April 2025 Roundup - Advanced Evaluation Features

April 2025 included **5 major releases** (v0.110.0 → v0.112.1) that added advanced eval metrics, security testing capabilities, and new model providers. The releases include METEOR scoring, Cerebras integration, and security plugins.

<!-- truncate -->

:::info April 2025 Highlights

This month added **METEOR and GLEU metrics** for text evaluation and **DoNotAnswer and XSTest plugins** for security testing.

:::

## 📊 April 2025 By The Numbers

- **5 Major Releases** (v0.110.0 → v0.112.1)
- **4 New Evaluation Metrics** (METEOR, GLEU, enhanced LLM rubric)
- **3 New Model Providers** (Cerebras, Grok-3, AWS Bedrock Knowledge Base)
- **3 New Security Plugins** (DoNotAnswer, XSTest, homoglyph strategy)
- **1 Grading Upgrade** (GPT-4.1)

## 🎯 Evaluation Metrics

### 📐 METEOR & GLEU Scoring (v0.112.0, v0.110.0)

Added two new eval metrics for text quality assessment:

**METEOR (Metric for Evaluation of Translation with Explicit ORdering):**

```yaml
tests:
  - vars:
      input: 'Translate this text'
    assert:
      - type: meteor
        value: 'expected translation'
        threshold: 0.8
```

**GLEU (Google-BLEU) for Enhanced Text Similarity:**

```yaml
tests:
  - vars:
      input: 'Source text for evaluation'
    assert:
      - type: gleu
        value: 'Expected output text'
        threshold: 0.7
```

:::tip

These metrics provide enhanced eval capabilities for translation, summarization, and content generation tasks.

:::

### 🧠 GPT-4.1 Grading (v0.111.0)

Upgraded grading to use GPT-4.1 for improved eval accuracy across all domains.

### 📋 Enhanced LLM Rubric (v0.111.0)

Modified LLM Rubric now supports arbitrary objects for flexible eval criteria:

```yaml
tests:
  - vars:
      input: 'Test input'
    assert:
      - type: llm-rubric
        value: |
          Grade on creativity and accuracy:
          - Creativity: 0-10 points
          - Accuracy: 0-10 points
          Total: /20 points
        rubricPrompt: |
          Evaluate the response using these criteria:
          {{rubric}}
```

## 🚀 Model Providers

### ⚡ Cerebras Integration (v0.112.0)

Added Cerebras provider for high-performance AI model eval:

```yaml
providers:
  - cerebras:llama-3.1-8b
    config:
      apiKey: ${CEREBRAS_API_KEY}
```

### 🌌 Grok-3 Support (v0.110.0)

Added Grok-3 model support for advanced AI evals:

```yaml
providers:
  - grok-3
    config:
      apiKey: ${GROK_API_KEY}
```

### 🏗️ AWS Bedrock Knowledge Base (v0.110.0)

Integrated AWS Bedrock Knowledge Base support for context-aware evals:

```yaml
providers:
  - bedrock:knowledge-base
    config:
      knowledgeBaseId: "your-kb-id"
      region: "us-east-1"
```

## 🛡️ Security Testing Features

### 🚫 DoNotAnswer Plugin (v0.111.0)

Added plugin implementing the DoNotAnswer dataset for testing models' ability to refuse inappropriate requests:

```yaml
redteam:
  plugins:
    - donotanswer
  purpose: 'Test AI safety and refusal capabilities'
```

### 🔍 XSTest Plugin (v0.111.0, v0.111.1)

Added cross-site scripting vulnerability testing for web-based AI systems:

```yaml
redteam:
  plugins:
    - xstest
  purpose: 'Test for XSS vulnerabilities'
```

### 🎭 Homoglyph Strategy (v0.112.0)

New red teaming strategy using homoglyphs (visually similar characters) to test model robustness:

```yaml
redteam:
  strategies:
    - homoglyph
    - extended-encodings
  plugins:
    - harmful
```

:::warning

Homoglyph strategies test models against visual deception attacks using characters that look identical but have different Unicode values.

:::

## ⚡ Performance & Infrastructure

### 🗃️ Universal Environment Variable Override (v0.112.0)

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

### 🔗 Persistent Search State (v0.112.0)

Search queries now persisted in URLs for better user experience and result sharing.

### 📊 Enhanced CSV Exports (v0.110.0)

- Results properly ordered by date
- Improved data export capabilities
- Better integration with external analysis tools

## 🎨 WebUI Improvements

### ⚓ Anchor Links to Rows (v0.111.0)

Added anchor link functionality to specific rows in eval results with automatic scroll-to-top behavior for better navigation and result sharing.

### ⚡ Enhanced Quick Selector (v0.111.0)

Improved Eval Quick Selector (Cmd+K) for better navigation and usability throughout the interface.

## 🐛 Fixes & Stability

### 🔐 Authentication & Sharing (v0.110.0)

- Removed deprecated authentication login flow
- Implemented sharing idempotence to prevent duplicates
- Fixed sharing configuration respect from promptfooconfig.yaml
- Added backward compatibility for `-y` flag

### 🔌 Provider Reliability

- **HuggingFace datasets** - Disabled variable expansion to prevent array field issues (v0.110.0)
- **Google Vertex AI** - Resolved output format issues (v0.110.0)
- **Raw HTTP provider** - Fixed transformRequest handling (v0.110.0)
- **JSON test files** - Fixed parsing to preserve test case structure (v0.110.0)

### 🎯 Eval Accuracy

- **Score results** now handle trailing newlines correctly (v0.112.0)
- **Matcher improvements** for more accurate eval (v0.112.0)
- **OpenAI Realtime API** history handling fixes (v0.112.0)

## 📦 Getting Started

Install the latest version:

```bash
npm install -g promptfoo@latest
```

Try the new capabilities:

```bash
# Use advanced metrics
npx promptfoo@latest eval --config config-with-meteor.yaml

# Test security with new plugins
npx promptfoo@latest redteam --plugins donotanswer,xstest

# Use new providers
npx promptfoo@latest eval --provider cerebras:llama-3.1-8b
```

## 🔗 See Also

- [METEOR Scoring Guide](/docs/configuration/expected-outputs/deterministic/#meteor)
- [GLEU Metric Documentation](/docs/configuration/expected-outputs/deterministic/#gleu)
- [DoNotAnswer Plugin Guide](/docs/red-team/plugins/donotanswer/)
- [XSTest Plugin Documentation](/docs/red-team/plugins/xstest/)
- [Cerebras Provider Setup](/docs/providers/cerebras/)
- [Homoglyph Strategy Guide](/docs/red-team/strategies/homoglyph/)

---

April 2025 added advanced eval metrics, security testing capabilities, and new provider support to promptfoo. These features support more sophisticated AI evaluation and security testing workflows.

Share your experience with the new features on [Discord](https://discord.gg/promptfoo) or [GitHub](https://github.com/promptfoo/promptfoo).

---

**Previous Roundups**: [March 2025](/releases/march-2025-roundup)  
**Next**: [May 2025](/releases/may-2025-roundup) • June 2025 Roundup (coming soon)
