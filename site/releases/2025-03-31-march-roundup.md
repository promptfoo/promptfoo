---
slug: march-2025-roundup
title: March 2025 Roundup
description: Comprehensive evaluation improvements, red team capabilities, and cloud platform enhancements across 200+ commits
authors: [promptfoo_team]
tags: [roundup, march-2025, evaluation, redteam, cloud, monthly-summary]
keywords:
  [
    LiteLLM,
    SageMaker,
    OpenAI Realtime,
    JSONL,
    CSV,
    multimodal,
    foundation models,
    adaptive prompting,
  ]
date: 2025-03-31T23:59
---

# March 2025 Roundup

March delivered extensive improvements across all product areas with 200+ commits. Major additions include new provider integrations, multimodal capabilities, red team enhancements, and cloud platform features.

<!-- truncate -->

## Promptfoo (Core Evaluation)

### Provider Integrations

**LiteLLM Provider** ([commit 3e6b66f86](https://github.com/promptfoo/promptfoo/commit/3e6b66f86))

```yaml
providers:
  - litellm:gpt-4
  - litellm:claude-3-opus
  - litellm:gemini-pro
```

Access 100+ models through unified interface.

**Amazon SageMaker Support** ([commit fcf6ac48f](https://github.com/promptfoo/promptfoo/commit/fcf6ac48f))

```yaml
providers:
  - sagemaker:my-endpoint
    config:
      region: us-east-1
```

Direct evaluation of SageMaker endpoints.

**OpenAI Realtime API** ([commit 50676d0d5](https://github.com/promptfoo/promptfoo/commit/50676d0d5))

```yaml
providers:
  - openai:realtime
    config:
      model: gpt-4o-realtime-preview
```

Support for real-time conversational AI evaluation.

**OpenAI Responses API** ([commit 80f1c6b8e](https://github.com/promptfoo/promptfoo/commit/80f1c6b8e))

```yaml
providers:
  - openai:gpt-4
    config:
      responseFormat: json_schema
      refusal: true
```

Enhanced structured output support.

### Data & Configuration

**JSONL Test Case Support** ([commit b0d1e2985](https://github.com/promptfoo/promptfoo/commit/b0d1e2985))

```jsonl
{"vars": {"input": "test1"}, "assert": [{"type": "contains", "value": "expected"}]}
{"vars": {"input": "test2"}, "assert": [{"type": "contains", "value": "expected"}]}
```

**CSV Prompt Loading** ([commit 0c58ee772](https://github.com/promptfoo/promptfoo/commit/0c58ee772))

```csv
id,prompt,category
greeting,"Hello {{name}}",basic
analysis,"Analyze: {{data}}",advanced
```

**CSV Metadata Arrays** ([commit 7bffbe9bb](https://github.com/promptfoo/promptfoo/commit/7bffbe9bb))

```yaml
metadata:
  tags: 'tag1,tag2,tag3' # Automatically parsed as array
```

### Multimodal Capabilities

**Google Live Function Callbacks** ([commit ea3c854f9](https://github.com/promptfoo/promptfoo/commit/ea3c854f9))

```yaml
providers:
  - google:live
    config:
      functions:
        - name: analyze_image
          callback: true
```

**Base64 Image Support**
Direct base64 image loading capabilities for seamless integration:

```yaml
tests:
  - vars:
      imageData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...'
```

**Multimodal Documentation** ([commit 820af1048](https://github.com/promptfoo/promptfoo/commit/820af1048))
Enhanced guides for image and audio evaluation workflows.

### Provider Enhancements

**Enhanced Python Provider** ([commit 8b2b1bfe7](https://github.com/promptfoo/promptfoo/commit/8b2b1bfe7))
Load arbitrary files in nested configurations for custom model integrations.

**Azure Assistant Improvements** ([commit 51bbbb6e9](https://github.com/promptfoo/promptfoo/commit/51bbbb6e9))
Better caching and integration support.

**Gemini 2.5 Pro Support** ([commit 1608b2d3c](https://github.com/promptfoo/promptfoo/commit/1608b2d3c))
Latest Gemini model integration.

**Bedrock Token Counting** ([commit 28a8e6a04](https://github.com/promptfoo/promptfoo/commit/28a8e6a04))
Support for all major Bedrock model types.

### Evaluation Improvements

**Factuality Grading Updates** ([commit 3e6b2eeb3](https://github.com/promptfoo/promptfoo/commit/3e6b2eeb3))
Improved cross-provider compatibility for factuality assessments.

**G-eval Logging** ([commit 27dab92fd](https://github.com/promptfoo/promptfoo/commit/27dab92fd))
Enhanced debugging with complete reasoning logs.

**HTTP Template Strings** ([commit 862373795](https://github.com/promptfoo/promptfoo/commit/862373795))
Direct template variable support in URLs.

**Environment File Support** ([commit e682354e5](https://github.com/promptfoo/promptfoo/commit/e682354e5))

```bash
npx promptfoo eval --env-file custom.env
```

_[Image placeholder: Provider integration overview showing LiteLLM, SageMaker, and Realtime API]_

## Promptfoo Redteam (Security Testing)

### Strategy Enhancements

**Multilingual Strategy Documentation** ([commit bfcb2e47f](https://github.com/promptfoo/promptfoo/commit/bfcb2e47f))
Improved guidance for multilingual red team testing.

**Entity Extraction Filtering** ([commit 38b1e6371](https://github.com/promptfoo/promptfoo/commit/38b1e6371))
Filter template variables from entity extraction for cleaner results.

### Grading Improvements

**PlinyGrader Enhancements** ([commit c6a00beda](https://github.com/promptfoo/promptfoo/commit/c6a00beda))
More accurate grading for Pliny benchmark results.

**Strategy Type Fixes** ([commit 7ecde2402](https://github.com/promptfoo/promptfoo/commit/7ecde2402))
Better TypeScript typing for red team strategies.

### Plugin Development

**RAG Poisoning Plugin** ([commit 700b79659](https://github.com/promptfoo/promptfoo/commit/700b79659))
Added missing constants for RAG poisoning attacks.

### Documentation & Guides

**OWASP Red Teaming Guide** ([commit 3258c5909](https://github.com/promptfoo/promptfoo/commit/3258c5909))
Comprehensive guide following OWASP methodology.

**Foundation Models Guide** ([commit 662833395](https://github.com/promptfoo/promptfoo/commit/662833395))
Specialized testing approaches for foundation models.

**Agent & RAG Testing** ([commit fb12e5ad6](https://github.com/promptfoo/promptfoo/commit/fb12e5ad6))
Enhanced documentation for testing AI agents and RAG systems.

**Azure Assistant Example** ([commit 602716407](https://github.com/promptfoo/promptfoo/commit/602716407))
Complete red team testing example for Azure assistants.

_[Image placeholder: Red team strategy overview with foundation model testing]_

## Promptfoo Cloud (Cloud Platform)

### Platform Features

**Adaptive Prompting** ([commit bab2a764](https://github.com/promptfoo/promptfoo/commit/bab2a764))
Dynamic prompt adaptation based on evaluation context.

**OpenRouter Proxy** ([commit e7835c8c](https://github.com/promptfoo/promptfoo/commit/e7835c8c))
`promptfoo:model` task for OpenRouter integration.

**DataGrid Improvements** ([commit fc4f4637](https://github.com/promptfoo/promptfoo/commit/fc4f4637))
Enhanced reports view with better data handling.

### User Experience

**Evaluation Navigation** ([commit 67b6d136](https://github.com/promptfoo/promptfoo/commit/67b6d136))
Fixed DataGrid row navigation issues.

**Metadata Search** ([commit 63e1c4c9](https://github.com/promptfoo/promptfoo/commit/63e1c4c9))
Improved search functionality for evaluation metadata.

**Separate Evals Index** ([commit 5cb3a84e](https://github.com/promptfoo/promptfoo/commit/5cb3a84e))
Dedicated evaluation index page for better organization.

### Infrastructure

**Zod Schema Migration** ([commit a4c43eb9](https://github.com/promptfoo/promptfoo/commit/a4c43eb9))
Converted DTO interfaces to Zod schemas for better type safety.

**Enhanced Error Tracking** ([commit 1b237717](https://github.com/promptfoo/promptfoo/commit/1b237717))
Added paths to track Zod validation failures.

**Component Synchronization** ([commit 15841138](https://github.com/promptfoo/promptfoo/commit/15841138))
Cursor rules for syncing components between repositories.

### Foundation Model Features

**Foundation Plugin Preset** ([commit ec73f8a6](https://github.com/promptfoo/promptfoo/commit/ec73f8a6))
Specialized testing presets for foundation models.

**Chat History Controls** ([commit 9558ac79](https://github.com/promptfoo/promptfoo/commit/9558ac79))
Removed unnecessary settings for foundation model testing.

### Model Management

**Model Cost Updates** ([commit 70623279](https://github.com/promptfoo/promptfoo/commit/70623279))
Updated pricing for latest model releases.

**OpenRouter Models** ([commit 05e84637](https://github.com/promptfoo/promptfoo/commit/05e84637))
Expanded model catalog with latest OpenRouter options.

_[Image placeholder: Cloud platform dashboard showing adaptive prompting and DataGrid improvements]_

## Infrastructure & Quality

### Build & Deployment

**Helm Charts** ([commit 2583a910](https://github.com/promptfoo/promptfoo/commit/2583a910))
Kubernetes deployment configurations.

**Docker Improvements** ([commit aa94c4ddc](https://github.com/promptfoo/promptfoo/commit/aa94c4ddc))
Better .promptfoo directory creation and container optimization.

### Testing & Quality

**Comprehensive Unit Tests**

- Python utilities testing ([commit 7b81997c3](https://github.com/promptfoo/promptfoo/commit/7b81997c3))
- Provider utilities testing ([commit adc0cae54](https://github.com/promptfoo/promptfoo/commit/adc0cae54))
- Evaluator helpers testing ([commit d2be23142](https://github.com/promptfoo/promptfoo/commit/d2be23142))

**Go Provider Fixes** ([commit b9357683e](https://github.com/promptfoo/promptfoo/commit/b9357683e))
Resolved CallApi redeclaration issues.

### Documentation

**Security Policy** ([commit 5be7ca2dc](https://github.com/promptfoo/promptfoo/commit/5be7ca2dc))
Added comprehensive security and responsible disclosure policies.

**Team Updates** ([commit 21fb7d461](https://github.com/promptfoo/promptfoo/commit/21fb7d461))
Updated team page with new members.

**Contributing Guide** ([commit adc0cae54](https://github.com/promptfoo/promptfoo/commit/adc0cae54))
Enhanced contribution guidelines.

## Getting Started

```bash
npm install -g promptfoo@latest

# Use LiteLLM provider
npx promptfoo eval --provider litellm:gpt-4

# Load JSONL test cases
npx promptfoo eval --tests tests.jsonl

# Test with SageMaker
npx promptfoo eval --provider sagemaker:my-endpoint

# Red team foundation models
npx promptfoo redteam --plugins foundation
```

## Documentation

- [LiteLLM Provider](/docs/providers/litellm/)
- [Amazon SageMaker](/docs/providers/sagemaker/)
- [OpenAI Realtime API](/docs/providers/openai/#realtime-api-models)
- [JSONL Test Cases](/docs/configuration/test-cases/)
- [Foundation Model Testing](/docs/red-team/foundation-models/)

---

**Next**: [April 2025](/releases/april-2025-roundup) • [May 2025](/releases/may-2025-roundup) • [June 2025](/releases/june-2025-roundup)
