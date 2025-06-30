---
slug: march-2025-roundup
title: March 2025 Roundup
description: LiteLLM integration, multimodal evaluation, foundation model testing, and 200+ commits
authors: [promptfoo_team]
tags: [roundup, march-2025, litellm, sagemaker, multimodal, foundation-models]
keywords: [LiteLLM, SageMaker, OpenAI Realtime, JSONL, CSV, multimodal, foundation models]
date: 2025-03-31T23:59
---

# March 2025 Roundup

March delivered 200+ commits with major provider integrations, multimodal capabilities, and enhanced red team testing.

<!-- truncate -->

## 🚀 Major Features

### LiteLLM Integration

Complete integration with LiteLLM's 100+ providers in a single interface:

```yaml
providers:
  - litellm:gpt-4.1
  - litellm:claude-3.7-sonnet
  - litellm:gemini-2.5-pro
  - litellm:llama-4-scout # New Llama 4 support
```

### JSONL Support

Native support for large-scale evaluations:

- Stream thousands of test cases
- Automatic chunking and progress tracking
- Memory-efficient processing

### Foundation Model Testing

New testing harness for transformer-based models:

```bash
npx promptfoo eval --provider sagemaker:endpoint/my-model
```

## 🛡️ Red Team Enhancements

### Fuzzing & Mutation Strategies

- **camelCase**: Tests case-sensitive parsing
- **dateFormatter**: Probes date/time vulnerabilities
- **mathInjection**: Tests numeric overflows

### Purpose Discovery ([PR #2023](https://github.com/promptfoo/promptfoo/pull/2023))

AI agent automatically discovers system capabilities:

```yaml
redteam:
  strategies:
    - prompt-extraction
    - purpose-discovery # NEW
```

[Space for screenshot: Purpose Discovery UI]

## 🎯 Developer Experience

### CSV Enhancements

- Prompt templates in CSV files
- Array metadata support
- Simplified test case management

### WebUI Improvements

- Revamped navigation with sticky headers
- Enhanced result filtering
- Expandable table rows

## 📊 Model Support

**New Models:**

- **Gemini 2.5 Pro/Flash** - Latest Google models
- **Amazon Nova** models on Bedrock
- **DeepSeek v3** - Cost-effective reasoning
- **o3-mini** preview support

## 🔧 Quick Start

```bash
# Try LiteLLM integration
npx promptfoo@latest init litellm-quickstart

# Stream JSONL test cases
npx promptfoo eval -c config.yaml --tests large-dataset.jsonl

# Red team with purpose discovery
npx promptfoo redteam --strategies purpose-discovery
```

## Bug Fixes & Performance

- Fixed console.log encoding issues
- Improved caching system (45% faster evals)
- Better memory management for large datasets

---

**[Full Changelog →](https://github.com/promptfoo/promptfoo/releases)**
