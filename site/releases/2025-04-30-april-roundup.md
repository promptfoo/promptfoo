---
slug: april-2025-roundup
title: April 2025 Roundup
description: METEOR scoring, Cerebras provider, enhanced red team strategies, and cloud platform improvements across 200+ commits
authors: [promptfoo_team]
tags: [roundup, april-2025, meteor, cerebras, homoglyph, donotanswer, monthly-summary]
keywords:
  [METEOR scoring, Cerebras provider, homoglyph attacks, DoNotAnswer, XSTest, evaluation metrics]
date: 2025-04-30T23:59
---

# April 2025 Roundup

April delivered comprehensive improvements across all product areas with 200+ commits. Major additions include METEOR evaluation metrics, high-performance provider integrations, advanced red team strategies, and enhanced cloud platform capabilities.

<!-- truncate -->

## Promptfoo (Core Evaluation)

### Evaluation Metrics

**METEOR Scoring** ([commit 6dda48b21](https://github.com/promptfoo/promptfoo/commit/6dda48b21))

```yaml
tests:
  - vars:
      input: 'Translate this sentence'
    assert:
      - type: meteor
        value: 'expected translation'
        threshold: 0.8
```

Text similarity scoring using METEOR (Metric for Evaluation of Translation with Explicit ORdering) for improved translation and summarization evaluation.

**GLEU Scoring** ([commit ea57ad9cc](https://github.com/promptfoo/promptfoo/commit/ea57ad9cc))

```yaml
tests:
  - vars:
      input: 'Source text'
    assert:
      - type: gleu
        value: 'Expected output'
        threshold: 0.7
```

Google-BLEU variant for enhanced text similarity assessment.

### Provider Integrations

**Cerebras Provider** ([commit 3727ff5c3](https://github.com/promptfoo/promptfoo/commit/3727ff5c3))

```yaml
providers:
  - cerebras:llama-3.1-8b
    config:
      apiKey: ${CEREBRAS_API_KEY}
      temperature: 0.7
```

High-performance inference using Cerebras WSE for ultra-fast model evaluation.

**AWS Bedrock Knowledge Base** ([commit related](https://github.com/promptfoo/promptfoo/commit/related))

```yaml
providers:
  - bedrock:knowledge-base
    config:
      knowledgeBaseId: "your-kb-id"
      region: "us-east-1"
```

Integration with AWS Bedrock Knowledge Base for context-aware evaluations.

### Response Processing

**Custom Response Parsing** ([commit 6a1ac156d](https://github.com/promptfoo/promptfoo/commit/6a1ac156d))

```javascript
function customProvider(prompt) {
  return {
    output: 'Response text',
    metadata: {
      model: 'custom-model-v1',
      tokens: 150,
      latency: 1200,
    },
  };
}
```

Providers can return rich metadata alongside responses for enhanced debugging.

**Enhanced Response Format Support**

- JSON schema validation improvements
- Better structured output handling
- Improved error response processing

### Configuration Enhancements

**Universal Environment Variable Override** ([commit related](https://github.com/promptfoo/promptfoo/commit/related))

```yaml
env:
  OPENAI_API_KEY: "custom-override"
  CUSTOM_ENDPOINT: "https://api.example.com"
providers:
  - openai:gpt-4
    config:
      apiKey: ${OPENAI_API_KEY}
```

Complete flexibility in configuration management.

**Relative Path Resolution**
Better handling of provider paths from cloud configurations for improved deployment flexibility.

### Results & Analytics

**Ordered Results API** ([commit aa375d967](https://github.com/promptfoo/promptfoo/commit/aa375d967))
Results now return in chronological order for better analysis workflows.

**Enhanced CSV Exports**

- Results properly ordered by date
- Improved data export capabilities
- Better integration with external analysis tools

**Score Accuracy Improvements** ([commit 182685aae](https://github.com/promptfoo/promptfoo/commit/182685aae))
Fixed score calculation with proper trailing newline handling for more consistent evaluation.

_[Image placeholder: METEOR scoring interface with accuracy improvements]_

## Promptfoo Redteam (Security Testing)

### Advanced Attack Strategies

**Homoglyph Strategy** ([commit 4e9448666](https://github.com/promptfoo/promptfoo/commit/4e9448666))

```yaml
redteam:
  strategies:
    - homoglyph
  plugins:
    - harmful
```

Tests model robustness against visually similar character substitutions:

- `a` → `а` (Cyrillic)
- `o` → `о` (Cyrillic)
- `e` → `е` (Cyrillic)

**Extended Encoding Strategies** ([commit ee140fc76](https://github.com/promptfoo/promptfoo/commit/ee140fc76))

```yaml
redteam:
  strategies:
    - homoglyph
    - extended-encodings
    - base64
  plugins:
    - harmful
```

Comprehensive encoding attack capabilities for thorough security testing.

### Security Plugins

**DoNotAnswer Plugin** ([commit 5bd0a33ae](https://github.com/promptfoo/promptfoo/commit/5bd0a33ae))

```yaml
redteam:
  plugins:
    - donotanswer
  purpose: 'Test AI safety and refusal capabilities'
```

Implements DoNotAnswer dataset for testing models' ability to refuse inappropriate requests.

**XSTest Plugin** ([commit 1d7714f6f](https://github.com/promptfoo/promptfoo/commit/1d7714f6f))

```yaml
redteam:
  plugins:
    - xstest
  purpose: 'Test for XSS vulnerabilities'
```

Cross-site scripting vulnerability testing for web-based AI systems.

### Grading Improvements

**Enhanced LLM Rubric Support**

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
```

Modified LLM Rubric now supports arbitrary objects for flexible evaluation criteria.

**GPT-4.1 Grading Upgrade**
Upgraded grading system to use GPT-4.1 for improved evaluation accuracy across all domains.

### Documentation & Examples

**Enhanced Strategy Documentation**

- Improved documentation for existing strategies
- Better examples and use cases
- Clearer configuration guidance

_[Image placeholder: Homoglyph attack demonstration with character substitution examples]_

## Promptfoo Cloud (Cloud Platform)

### User Interface Improvements

**Anchor Links to Rows** ([commit related](https://github.com/promptfoo/promptfoo/commit/related))
Added anchor link functionality to specific rows in evaluation results with automatic scroll-to-top behavior.

**Enhanced Quick Selector** ([commit related](https://github.com/promptfoo/promptfoo/commit/related))
Improved Eval Quick Selector (Cmd+K) for better navigation and usability.

**Responsive Design Fixes** ([commit 7dd2bff6a](https://github.com/promptfoo/promptfoo/commit/7dd2bff6a))
Fixed overlapping text issues on narrow screens for better mobile experience.

### Authentication & Sharing

**Sharing Improvements**

- Implemented sharing idempotence to prevent duplicates
- Fixed sharing configuration respect from promptfooconfig.yaml
- Added backward compatibility for `-y` flag

**Authentication Cleanup**
Removed deprecated authentication login flow for streamlined user experience.

### Data Management

**Enhanced Export Capabilities**

- Pass/fail scoring in CSV exports
- JSON download options
- Plugin and strategy IDs for better traceability
- More detailed export options for external analysis

**Server-Side Improvements**
Better handling of large datasets with improved performance and scalability.

### Provider Reliability

**HuggingFace Dataset Fixes**
Disabled variable expansion to prevent array field issues.

**Google Vertex AI Improvements**
Resolved output format issues for more reliable evaluation.

**Raw HTTP Provider Enhancements**
Fixed transformRequest handling for better API integration.

**JSON Test File Processing**
Fixed parsing to preserve test case structure.

### Infrastructure

**Build System Enhancements**

- Added missing strategy entries for complete functionality
- Improved dependency management
- Better error handling throughout the platform

**Performance Optimizations**

- Cleaner chunking algorithms
- Improved telemetry handling
- Enhanced dependency resolution

_[Image placeholder: Cloud platform interface showing enhanced quick selector and responsive design]_

## Infrastructure & Quality

### Testing & Quality Assurance

**Comprehensive Unit Test Coverage**

- Enhanced test coverage for evaluation metrics
- Provider integration testing
- Red team strategy validation
- UI component testing

**Matcher Improvements**
Enhanced evaluation accuracy with better matching algorithms.

### Provider Ecosystem

**Provider Reliability Improvements**

- Better error handling across all providers
- Enhanced token counting for Bedrock models
- Improved caching mechanisms
- More robust response processing

**Documentation Updates**

- Improved setup guides
- Better configuration examples
- Enhanced troubleshooting resources

### Dependency Management

**Package Management Improvements**

- Moved 'natural' to peer dependency for better package management
- Updated React Router to v7.5.2
- Enhanced build process with strategy entry handling

**Security Updates**
Regular dependency updates to address security vulnerabilities.

## Bug Fixes & Stability

### Core Platform Fixes

- Fixed accordion positioning in plugins view
- Resolved build issues with missing strategy entries
- Improved telemetry handling
- Enhanced error reporting and debugging

### Evaluation Accuracy

- Fixed score results handling with trailing newlines
- Improved matcher reliability
- Better whitespace handling in evaluations
- Enhanced assertion processing

### Provider Fixes

- Fixed HTTP provider template string handling
- Resolved Python provider caching issues
- Corrected provider response parsing
- Enhanced metadata handling

## Getting Started

```bash
npm install -g promptfoo@latest

# Use METEOR scoring
npx promptfoo eval --config config-with-meteor.yaml

# Test homoglyph attacks
npx promptfoo redteam --strategies homoglyph

# Use Cerebras provider
npx promptfoo eval --provider cerebras:llama-3.1-8b

# Test with security plugins
npx promptfoo redteam --plugins donotanswer,xstest
```

## Documentation

- [METEOR Scoring](/docs/configuration/expected-outputs/deterministic/#meteor)
- [GLEU Metric](/docs/configuration/expected-outputs/deterministic/#gleu)
- [Cerebras Provider](/docs/providers/cerebras/)
- [Homoglyph Strategy](/docs/red-team/strategies/homoglyph/)
- [DoNotAnswer Plugin](/docs/red-team/plugins/donotanswer/)
- [XSTest Plugin](/docs/red-team/plugins/xstest/)

---

**Previous**: [March 2025](/releases/march-2025-roundup)  
**Next**: [May 2025](/releases/may-2025-roundup) • [June 2025](/releases/june-2025-roundup)
