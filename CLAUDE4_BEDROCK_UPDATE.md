# Claude 4 Bedrock Integration Summary

This document summarizes the changes made to support Claude 4 models in Amazon Bedrock for Promptfoo.

## What's New

Added support for Claude 4 models in Amazon Bedrock:

- **Claude Opus 4** (`anthropic.claude-opus-4-20250514-v1:0`)
- **Claude Sonnet 4** (`anthropic.claude-sonnet-4-20250514-v1:0`)

## Changes Made

### 1. Core Provider Updates (`src/providers/bedrock.ts`)

Added Claude 4 model IDs to `AWS_BEDROCK_MODELS`:

- Base models: `anthropic.claude-opus-4-20250514-v1:0`, `anthropic.claude-sonnet-4-20250514-v1:0`
- Regional models:
  - US: `us.anthropic.claude-opus-4-20250514-v1:0`, `us.anthropic.claude-sonnet-4-20250514-v1:0`
  - EU: `eu.anthropic.claude-sonnet-4-20250514-v1:0` (Sonnet only)
  - APAC: `apac.anthropic.claude-sonnet-4-20250514-v1:0` (Sonnet only)

### 2. Documentation Updates (`site/docs/providers/aws-bedrock.md`)

- Updated introduction to mention Claude 4 support
- Added Claude 4 models section with descriptions and regional availability
- Updated all example configurations to use Claude 4 models
- Updated troubleshooting examples with Claude 4 model IDs

### 3. Example Updates

Updated all Bedrock examples to showcase Claude 4:

- **Main example** (`examples/amazon-bedrock/promptfooconfig.yaml`): Added Claude 4 models at the top
- **Claude example** (`examples/amazon-bedrock/promptfooconfig.claude.yaml`): Features Claude 4 models with thinking
- **Knowledge Base** (`examples/amazon-bedrock/promptfooconfig.kb.yaml`): Shows Claude 4 with RAG
- **Tool Use** (`examples/tool-use/promptfooconfig.bedrock.yaml`): Demonstrates Claude 4 tool calling
- **README** (`examples/amazon-bedrock/README.md`): Comprehensive guide for Claude 4 on Bedrock

## Regional Availability

### Claude Opus 4

- US East (Ohio, N. Virginia)
- US West (Oregon)

### Claude Sonnet 4

- US East (Ohio, N. Virginia)
- US West (Oregon)
- Asia Pacific (Hyderabad, Mumbai, Osaka, Seoul, Singapore, Sydney, Tokyo)
- Europe (Spain)

## Usage Examples

### Basic Configuration

```yaml
providers:
  - id: bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0
    config:
      region: us-west-2
      temperature: 0.7
      max_tokens: 2048
```

### With Extended Thinking

```yaml
providers:
  - id: bedrock:us.anthropic.claude-opus-4-20250514-v1:0
    config:
      thinking:
        type: enabled
        budget_tokens: 16000
      showThinking: true
      max_tokens: 32000
```

## Testing

To test the Claude 4 Bedrock integration:

```bash
cd examples/amazon-bedrock
npx promptfoo@latest eval
```

Ensure you have:

1. AWS credentials configured
2. Model access enabled in AWS Bedrock console
3. AWS SDK installed: `npm install -g @aws-sdk/client-bedrock-runtime`
