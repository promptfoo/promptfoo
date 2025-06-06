---
slug: march-2025-roundup
title: March 2025 Roundup - Multimodal Security Features
description: Model scanner command, audio/image red team strategies, and multimodal capabilities added in March releases
authors: [promptfoo_team]
tags:
  [
    roundup,
    march-2025,
    model-scanner,
    multimodal,
    audio-strategy,
    image-strategy,
    base64,
    monthly-summary,
  ]
keywords:
  [model scanner, audio strategy, multimodal AI, red team, security testing, image attacks, base64]
date: 2025-03-31T23:59
---

# March 2025 Roundup - Multimodal Security Features

March 2025 included **2 major releases** (v0.106.0 → v0.107.0) that added multimodal capabilities and model security scanning. The releases include a new model scanner command and audio-based red team strategies.

<!-- truncate -->

:::info March 2025 Highlights

This month added the **model scanner command** and **audio-based red teaming** capabilities for security testing.

:::

## 📊 March 2025 By The Numbers

- **2 Major Releases** (v0.106.0 → v0.107.0)
- **1 New Security Tool** (Model Scanner)
- **3 New Multimodal Strategies** (Audio, convert-to-image, enhanced image jailbreak)
- **2 Image Processing Features** (Base64 loading, live sequential functions)
- **1 Configuration Enhancement** (Prompt function config returns)

## 🔍 Model Security Scanner

### 🛡️ Model Scan Command (v0.107.0)

The new model scanner command provides automated security assessment for AI models:

```bash
npx promptfoo@latest scan-model --provider openai:gpt-4 --output scan-report.json
```

Use this command to:

- Run systematic vulnerability assessments across multiple attack vectors
- Generate automated security reports
- Scan production AI systems for security gaps
- Export detailed analysis of model weaknesses

## 🎭 Multimodal Security Testing

### 🎵 Audio Strategy (v0.107.0)

Added audio-based red teaming strategy for testing multimodal model vulnerabilities:

```yaml
redteam:
  strategies:
    - audio
  plugins:
    - harmful
  purpose: 'Test multimodal AI safety with audio attacks'
```

This strategy enables you to:

- Test audio input handling for security vulnerabilities
- Validate speech processing security in AI systems
- Run cross-modal attacks on multimodal boundaries

### 🖼️ Convert to Image Strategy (v0.107.0)

New strategy converts text attacks to images to test visual input processing:

```yaml
redteam:
  strategies:
    - convert-to-image
    - image-jailbreak
  plugins:
    - harmful
  purpose: 'Test visual input security'
```

:::warning

Image conversion attacks can bypass text-based filters by encoding content visually.

:::

## 🚀 Multimodal Capabilities

### 🔄 Live Sequential Function Calls (v0.107.0)

Added multimodal live sequential function calls for complex interactive evals:

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

Use this feature to:

- Create complex multimodal workflows with sequential processing
- Build interactive eval scenarios with real-time responses
- Chain functions for sophisticated testing
- Run dynamic assessments with live providers

## 📸 Image Processing

### 🔤 Base64 Image Loader (v0.106.0)

Added base64 image loading capabilities for seamless integration with various image sources:

```yaml
prompts:
  - |
    Analyze this image: {{imageData}}
tests:
  - vars:
      imageData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...'
```

This feature provides:

- Universal image compatibility across formats and sources
- Embedded image support in configuration files
- Dynamic image loading for automated testing workflows
- Cross-platform image handling without external dependencies

## ⚙️ Dynamic Configuration

### 🔧 Prompt Function Config Returns (v0.106.0)

Prompt functions can now return configuration objects alongside content:

```javascript title="prompts/dynamic-prompt.js"
module.exports = function (vars) {
  return {
    content: `Analyze: ${vars.input}`,
    config: {
      temperature: vars.complexity > 0.5 ? 0.8 : 0.2,
      max_tokens: vars.length === 'long' ? 2000 : 500,
    },
  };
};
```

Use this feature to:

- Set dynamic configuration based on eval context
- Adjust parameters for different test scenarios
- Optimize prompts based on input characteristics
- Configure model behavior contextually

## 🎨 User Experience Improvements

### 📊 Metadata Filtering (v0.107.0)

Added metadata filtering in ResultsTable for data analysis:

- Run custom metadata queries for targeted analysis
- Filter eval results with advanced capabilities
- Search functionality with metadata integration
- Improved analytics workflows

### 📥 Download Failed Tests Dialog (v0.107.0)

New dialog for downloading failed test cases:

- Export targeted failure analysis
- Create quality assurance workflows for systematic debugging
- Access detailed failure data for investigation
- Streamline error investigation processes

### 🌐 Server Environment Enhancement (v0.107.0)

Server now automatically loads .env files on startup:

```bash
npx promptfoo@latest view --port 3000
# .env file is loaded automatically
```

## 🔧 Provider & Infrastructure Updates

### 🤖 DeepSeek Provider Enhancements (v0.107.0)

- Added Bedrock support for DeepSeek models
- Integrated reasoning context into output for transparency
- Enhanced DeepSeek capabilities across multiple platforms

### ☁️ Azure Reasoning Models (v0.107.0)

Improved support for Azure reasoning models with updated documentation and enhanced integration.

## 🐛 Fixes & Stability

### 🔧 Eval Accuracy (v0.107.0)

- Fixed metadata merging between test cases and provider responses
- Improved remote grading with assertion data inclusion
- Updated moderation flags and test case metadata handling

### 🌐 Provider Reliability (v0.107.0)

- Fixed HTTP provider headers environment variable substitution
- Corrected self-hosting URL display
- Fixed missing plugins in WebUI report view

## 📦 Getting Started

Install the latest version:

```bash
npm install -g promptfoo@latest
```

Try the new capabilities:

```bash
# Run model security scanning
npx promptfoo@latest scan-model --provider openai:gpt-4

# Use multimodal red teaming with audio
npx promptfoo@latest redteam --strategies audio,convert-to-image

# Test dynamic configuration with base64 images
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

March 2025 added systematic model security scanning and multimodal attack strategies to promptfoo. These features support AI safety and security testing for multimodal systems.

Share your experience with the new features on [Discord](https://discord.gg/promptfoo) or [GitHub](https://github.com/promptfoo/promptfoo).

---

**Next**: [April 2025](/releases/april-2025-roundup) • [May 2025](/releases/may-2025-roundup) • June 2025 Roundup (coming soon)
