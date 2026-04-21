---
title: Alibaba Cloud (Qwen) Provider
sidebar_label: Alibaba Cloud (Qwen)
description: Deploy Alibaba Cloud's Qwen models including Qwen3, QwQ reasoning, and specialized coding/math/vision models for enterprise applications
keywords: [alibaba, qwen, qwen3, dashscope, deepseek, qwq, reasoning, vision, multimodal, llm]
---

# Alibaba Cloud (Qwen)

[Alibaba Cloud's DashScope API](https://www.alibabacloud.com/help/en/model-studio/getting-started/models) provides OpenAI-compatible access to Qwen language models. Compatible with all [OpenAI provider](/docs/providers/openai/) options in promptfoo.

## Setup

To use Alibaba Cloud's API, set the `DASHSCOPE_API_KEY` environment variable or specify via `apiKey` in the configuration file:

```sh
export DASHSCOPE_API_KEY=your_api_key_here
```

## Configuration

The provider supports all [OpenAI provider](/docs/providers/openai) configuration options. Example usage:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - alibaba:qwen-max # Simple usage
  - id: alibaba:qwen-plus # Aliases: alicloud:, aliyun:, dashscope:
    config:
      temperature: 0.7
      apiKey: your_api_key_here # Alternative to DASHSCOPE_API_KEY environment variable
      apiBaseUrl: https://dashscope-intl.aliyuncs.com/compatible-mode/v1 # Optional: Override default API base URL
```

:::note

If you're using the Alibaba Cloud Beijing region console, switch the base URL to `https://dashscope.aliyuncs.com/compatible-mode/v1` instead of the international endpoint.

:::

## Supported Models

The Alibaba provider includes support for the following model formats:

### Qwen 3 Flagship

- `qwen3-max` - Next-generation flagship with reasoning and tool integration
- `qwen3-max-preview` - Preview version with thinking mode support
- `qwen3-max-2025-09-23` - September 2025 snapshot
- `qwen-max` - 32K context (30,720 in, 8,192 out)
- `qwen-max-latest` - Always updated to latest version
- `qwen-max-2025-01-25` - January 2025 snapshot
- `qwen-plus` / `qwen-plus-latest` - 128K-1M context (thinking & non-thinking modes)
- `qwen-plus-2025-09-11`, `qwen-plus-2025-07-28`, `qwen-plus-2025-07-14`, `qwen-plus-2025-04-28`, `qwen-plus-2025-01-25` - Dated snapshots
- `qwen-flash` / `qwen-flash-2025-07-28` - Latency-optimized general model
- `qwen-turbo` / `qwen-turbo-latest` / `qwen-turbo-2025-04-28` / `qwen-turbo-2024-11-01` - Fast, cost-effective (being replaced by qwen-flash)
- `qwen-long-latest` / `qwen-long-2025-01-25` - **10M context** for long-text analysis, summarization, and extraction

### Qwen 3 Omni & Realtime

- `qwen3-omni-flash` / `qwen3-omni-flash-2025-09-15` - Multimodal flagship with speech + vision support (thinking & non-thinking modes)
- `qwen3-omni-flash-realtime` / `qwen3-omni-flash-realtime-2025-09-15` - Streaming realtime with audio stream input and VAD
- `qwen3-omni-30b-a3b-captioner` - Dedicated audio captioning model (speech, ambient sounds, music)
- `qwen2.5-omni-7b` - Qwen2.5-based multimodal model with text, image, speech, and video inputs

### Reasoning & Research

- `qwq-plus` - Alibaba's reasoning model (commercial)
- `qwq-32b` - Open-source QwQ reasoning model trained on Qwen2.5
- `qwq-32b-preview` - Experimental QwQ research model (2024)
- `qwen-deep-research` - Long-form research assistant with web search
- `qvq-max` / `qvq-max-latest` / `qvq-max-2025-03-25` - Visual reasoning models (commercial)
- `qvq-72b-preview` - Experimental visual reasoning research model
- **DeepSeek models** (hosted by Alibaba Cloud):
  - `deepseek-v3.2-exp` / `deepseek-v3.1` / `deepseek-v3` - Latest DeepSeek models (671-685B)
  - `deepseek-r1` / `deepseek-r1-0528` - DeepSeek reasoning models
  - `deepseek-r1-distill-qwen-{1.5b,7b,14b,32b}` - Distilled on Qwen2.5
  - `deepseek-r1-distill-llama-{8b,70b}` - Distilled on Llama

### Vision & Multimodal

**Commercial:**

- `qwen3-vl-plus` / `qwen3-vl-plus-2025-09-23` - High-res image support with long context (thinking & non-thinking modes)
- `qwen3-vl-flash` / `qwen3-vl-flash-2025-10-15` - Fast vision model with thinking mode support
- `qwen-vl-max` - 7.5K context, 1,280 tokens/image
- `qwen-vl-plus` - High-res image support
- `qwen-vl-ocr` - OCR-optimized for documents, tables, handwriting (30+ languages)

**Open-source:**

- `qwen3-vl-235b-a22b-thinking` / `qwen3-vl-235b-a22b-instruct` - 235B parameter Qwen3-VL
- `qwen3-vl-32b-thinking` / `qwen3-vl-32b-instruct` - 32B parameter Qwen3-VL
- `qwen3-vl-30b-a3b-thinking` / `qwen3-vl-30b-a3b-instruct` - 30B parameter Qwen3-VL
- `qwen3-vl-8b-thinking` / `qwen3-vl-8b-instruct` - 8B parameter Qwen3-VL
- `qwen2.5-vl-{72b,7b,3b}-instruct` - Qwen 2.5 VL series

### Audio & Speech

- `qwen3-asr-flash` / `qwen3-asr-flash-2025-09-08` - Multilingual speech recognition (11 languages, Chinese dialects)
- `qwen3-asr-flash-realtime` / `qwen3-asr-flash-realtime-2025-10-27` - Real-time speech recognition with automatic language detection
- `qwen3-omni-flash-realtime` - Supports speech streaming with VAD

### Coding & Math

**Commercial:**

- `qwen3-coder-plus` / `qwen3-coder-plus-2025-09-23` / `qwen3-coder-plus-2025-07-22` - Coding agents with tool calling
- `qwen3-coder-flash` / `qwen3-coder-flash-2025-07-28` - Fast code generation
- `qwen-math-plus` / `qwen-math-plus-latest` / `qwen-math-plus-2024-09-19` / `qwen-math-plus-2024-08-16` - Math problem solving
- `qwen-math-turbo` / `qwen-math-turbo-latest` / `qwen-math-turbo-2024-09-19` - Fast math reasoning
- `qwen-mt-{plus,turbo}` - Machine translation (92 languages)
- `qwen-doc-turbo` - Document mining and structured extraction

**Open-source:**

- `qwen3-coder-480b-a35b-instruct` / `qwen3-coder-30b-a3b-instruct` - Open-source Qwen3 coder models
- `qwen2.5-math-{72b,7b,1.5b}-instruct` - Math-focused models with CoT/PoT/TIR reasoning

### Qwen 2.5 Series

All support 131K context (129,024 in, 8,192 out)

- `qwen2.5-{72b,32b,14b,7b}-instruct`
- `qwen2.5-{7b,14b}-instruct-1m`

### Qwen 2 Series

- `qwen2-72b-instruct` - 131K context
- `qwen2-57b-a14b-instruct` - 65K context
- `qwen2-7b-instruct` - 131K context

### Qwen 1.5 Series

8K context (6K in, 2K out)

- `qwen1.5-{110b,72b,32b,14b,7b}-chat`

### Qwen 3 Open-source Models

Latest open-source Qwen3 models with thinking mode support:

- `qwen3-next-80b-a3b-thinking` / `qwen3-next-80b-a3b-instruct` - Next-gen 80B (September 2025)
- `qwen3-235b-a22b-thinking-2507` / `qwen3-235b-a22b-instruct-2507` - 235B July 2025 versions
- `qwen3-30b-a3b-thinking-2507` / `qwen3-30b-a3b-instruct-2507` - 30B July 2025 versions
- `qwen3-235b-a22b` - 235B with dual-mode support (thinking/non-thinking)
- `qwen3-32b` - 32B dual-mode model
- `qwen3-30b-a3b` - 30B dual-mode model
- `qwen3-14b`, `qwen3-8b`, `qwen3-4b` - Smaller dual-mode models
- `qwen3-1.7b`, `qwen3-0.6b` - Edge/mobile models

### Third-party Models

**Kimi (Moonshot AI):**

- `moonshot-kimi-k2-instruct` - First open-source trillion-parameter MoE model in China (activates 32B parameters)

### Embeddings

- `text-embedding-v3` - 1,024d vectors, 8,192 token limit, 50+ languages
- `text-embedding-v4` - Latest Qwen3-Embedding with flexible dimensions (64-2048d), 100+ languages

### Image Generation

- `qwen-image-plus` - Text-to-image with complex text rendering (Chinese/English)

For the latest availability, see the [official DashScope model catalog](https://www.alibabacloud.com/help/en/model-studio/getting-started/models), which is updated frequently.

## Additional Configuration

- `vl_high_resolution_images`: bool - Increases image token limit from 1,280 to 16,384 (qwen-vl-max only)

Standard [OpenAI parameters](/docs/providers/openai/#configuring-parameters) (temperature, max_tokens) are supported. Base URL: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` (or `https://dashscope.aliyuncs.com/compatible-mode/v1` for the Beijing region).

For API usage details, see [Alibaba Cloud documentation](https://www.alibabacloud.com/help/en/model-studio/getting-started/models).

## See Also

- [OpenAI Provider](/docs/providers/openai)

## Reference

- [Alibaba Cloud DashScope documentation](https://www.alibabacloud.com/help/en/model-studio/getting-started/models)
