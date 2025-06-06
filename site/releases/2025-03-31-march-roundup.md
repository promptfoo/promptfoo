---
slug: march-2025-roundup
title: March 2025 Roundup - The Multimodal Security Revolution
description: Major releases introducing model scanner, audio/image red team strategies, and multimodal capabilities for advanced AI security testing
authors: [promptfoo_team]
tags: [roundup, march-2025, model-scanner, multimodal, audio-strategy, image-strategy, base64, monthly-summary]
keywords: [model scanner, audio strategy, multimodal AI, red team, security testing, image attacks, base64]
date: 2025-03-31T23:59
---

# March 2025 Roundup: The Multimodal Security Revolution

March 2025 marked a revolutionary turning point for AI eval and security testing, with **2 major releases** that introduced groundbreaking multimodal capabilities and comprehensive model security scanning. From audio-based red teaming to intelligent model vulnerability assessment, March established promptfoo as the definitive platform for next-generation AI safety.

<!-- truncate -->

:::info March 2025 Highlights

This month introduced the **model scanner command** and **audio-based red teaming** - two industry-first capabilities that fundamentally changed AI security testing.

:::

## 📊 March 2025 By The Numbers

- **2 Major Releases** (v0.106.0 → v0.107.0)
- **1 Revolutionary Security Tool** (Model Scanner)
- **3 Breakthrough Multimodal Strategies** (Audio, convert-to-image, enhanced image jailbreak)
- **2 Advanced Image Capabilities** (Base64 loading, live sequential functions)
- **1 Dynamic Configuration Innovation** (Prompt function config returns)

## 🔍 Revolutionary Model Security Scanner

### 🛡️ Model Scan Command - The Game Changer (v0.107.0)
March's crown jewel was the introduction of the **model scanner command** - a comprehensive AI security assessment tool that fundamentally changed how teams approach model vulnerability testing:

```bash
# Comprehensive model security scanning
npx promptfoo@latest model-scan --provider openai:gpt-4 --output scan-report.json
```

:::tip Enterprise Security

The model scanner provides systematic vulnerability assessment across multiple attack vectors, making enterprise-grade security testing accessible to all teams.

:::

This tool provides:
- **Systematic vulnerability assessment** across multiple attack vectors
- **Automated security testing** with comprehensive reporting
- **Enterprise-ready scanning** for production AI systems
- **Detailed analysis** of model weaknesses and security gaps

## 🎭 Multimodal Security Breakthrough

### 🎵 Audio Strategy - First of Its Kind (v0.107.0)
March introduced the world's first **audio-based red teaming strategy** for testing multimodal model vulnerabilities:

```yaml
redteam:
  strategies:
    - audio
  plugins:
    - harmful
  purpose: "Test multimodal AI safety with audio attacks"
```

This revolutionary approach:
- **Tests audio input handling** for security vulnerabilities
- **Challenges multimodal boundaries** with cross-modal attacks
- **Validates speech processing** security in AI systems
- **Pioneers new attack vectors** for comprehensive testing

### 🖼️ Convert to Image Strategy - Visual Deception (v0.107.0)
A groundbreaking strategy that **converts text attacks to images** to test visual input processing:

```yaml
redteam:
  strategies:
    - convert-to-image
    - image-jailbreak
  plugins:
    - harmful
  purpose: "Test visual input security"
```

:::warning Cross-Modal Vulnerabilities

Image conversion attacks can bypass text-based filters by encoding malicious content visually - a critical security consideration for multimodal systems.

:::

## 🚀 Advanced Multimodal Capabilities

### 🔄 Live Sequential Function Calls (v0.107.0)
Revolutionary **multimodal live sequential function calls** for complex interactive evals:

```yaml title="promptfooconfig.yaml"
providers:
  - google:live
    config:
      multiSegment: true
      functions:
        - name: analyze_image
          sequential: true
        - name: process_audio
          sequential: true
```

This enables:
- **Complex multimodal workflows** with sequential processing
- **Interactive eval scenarios** with real-time responses
- **Advanced function chaining** for sophisticated testing
- **Live provider capabilities** for dynamic assessment

## 📸 Advanced Image Processing

### 🔤 Base64 Image Loader (v0.106.0)
Revolutionary **base64 image loading** capabilities enabling seamless integration with various image sources:

```yaml
prompts:
  - |
    Analyze this image: {{imageData}}
tests:
  - vars:
      imageData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
```

This breakthrough provides:
- **Universal image compatibility** across formats and sources
- **Embedded image support** in configuration files
- **Dynamic image loading** for automated testing workflows
- **Cross-platform image handling** without external dependencies

## ⚙️ Dynamic Configuration Revolution

### 🔧 Prompt Function Config Returns (v0.106.0)
A fundamental advancement allowing **prompt functions to return configuration objects** alongside content:

```javascript title="prompts/dynamic-prompt.js"
module.exports = function(vars) {
  return {
    content: `Analyze: ${vars.input}`,
    config: {
      temperature: vars.complexity > 0.5 ? 0.8 : 0.2,
      max_tokens: vars.length === 'long' ? 2000 : 500
    }
  };
};
```

This innovation enables:
- **Dynamic configuration** based on eval context
- **Adaptive parameter tuning** for different test scenarios
- **Intelligent prompt optimization** based on input characteristics
- **Context-aware model behavior** for enhanced testing accuracy

## 🎨 Enhanced User Experience

### 📊 Metadata Filtering Revolution (v0.107.0)
Advanced **metadata filtering in ResultsTable** for sophisticated data analysis:
- **Custom metadata queries** for targeted analysis
- **Advanced filtering capabilities** across eval results
- **Enhanced search functionality** with metadata integration
- **Professional analytics workflows** for enterprise users

### 📥 Download Failed Tests Dialog (v0.107.0)
New **dialog for downloading failed test cases** enabling:
- **Targeted failure analysis** with easy export
- **Quality assurance workflows** for systematic debugging
- **Enhanced debugging capabilities** with detailed failure data
- **Streamlined error investigation** processes

### 🌐 Server Environment Enhancement (v0.107.0)
Server now **automatically loads .env files** on startup for easier configuration management:

```bash
# Server automatically loads environment variables
npx promptfoo@latest view --port 3000
# .env file is loaded automatically
```

## 🔧 Provider & Infrastructure Advances

### 🤖 DeepSeek Provider Enhancements (v0.107.0)
- **Bedrock support** for DeepSeek models
- **Reasoning context integration** into output for transparency
- **Enhanced DeepSeek capabilities** across multiple platforms

### ☁️ Azure Reasoning Models (v0.107.0)
Improved support for **Azure reasoning models** with updated documentation and enhanced integration.

## 🐛 Critical Fixes & Stability

### 🔧 Eval Accuracy (v0.107.0)
- **Fixed metadata merging** between test cases and provider responses
- **Enhanced remote grading** with assertion data inclusion
- **Updated moderation flags** and test case metadata handling

### 🌐 Provider Reliability (v0.107.0)
- **HTTP provider headers** - Fixed environment variable substitution
- **Self-hosting URL display** corrections
- **WebUI report plugins** - Fixed missing plugins in report view

## 📦 Getting Started

Experience March's innovations:

```bash
npm install -g promptfoo@latest
```

Try the breakthrough capabilities:

```bash
# Comprehensive model security scanning
npx promptfoo@latest model-scan --provider openai:gpt-4

# Multimodal red teaming with audio
npx promptfoo@latest redteam --strategies audio,convert-to-image

# Dynamic configuration with base64 images
npx promptfoo@latest eval --config multimodal-config.yaml
```

## 🔗 See Also

- [Model Scanner Documentation](/docs/model-audit/)
- [Audio Strategy Guide](/docs/red-team/strategies/audio/)
- [Image Conversion Strategy](/docs/red-team/strategies/image/)
- [Base64 Image Loading](/docs/configuration/datasets/#image-data)
- [Multimodal Live Functions](/docs/providers/google/#live-functions)
- [WebUI Filtering Guide](/docs/usage/web-ui/#filtering)

---

March 2025 revolutionized AI eval by introducing systematic model security scanning and pioneering multimodal attack strategies. These breakthrough capabilities established promptfoo as the essential platform for organizations serious about AI safety and security testing in the multimodal age.

**How has the model scanner changed your security testing approach?** Join the conversation on [Discord](https://discord.gg/promptfoo) or [GitHub](https://github.com/promptfoo/promptfoo).

---

**Next**: [April 2025](/releases/april-2025-roundup) • [May 2025](/releases/may-2025-roundup) • June 2025 Roundup (coming soon) 