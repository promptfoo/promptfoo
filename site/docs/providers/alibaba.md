---
title: Alibaba Cloud (Qwen) Provider
sidebar_label: Alibaba Cloud (Qwen)
description: Deploy Alibaba Cloud's current Qwen, DeepSeek, Kimi, GLM, MiniMax, MiMo, and StepFun models through its OpenAI-compatible DashScope API
keywords:
  [
    alibaba,
    qwen,
    qwen3.7,
    dashscope,
    deepseek,
    kimi,
    glm,
    minimax,
    mimo,
    stepfun,
    reasoning,
    vision,
    multimodal,
    llm,
  ]
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
  - alibaba:qwen3.7-max # Simple usage
  - id: alibaba:qwen3.7-plus # Aliases: alicloud:, aliyun:, dashscope:
    config:
      temperature: 0.7
      apiKey: your_api_key_here # Alternative to DASHSCOPE_API_KEY environment variable
      apiBaseUrl: https://dashscope-intl.aliyuncs.com/compatible-mode/v1 # Optional: Override default API base URL
```

:::note

Direct-supply third-party IDs with vendor prefixes (such as `kimi/`, `ZHIPU/`, `MiniMax/`, `xiaomi/`, `stepfun/`, and `vanchin/`) are Beijing-only. To use them, set `apiBaseUrl: https://dashscope.aliyuncs.com/compatible-mode/v1`; the provider otherwise uses the international endpoint.

:::

## Supported Models

Availability varies by region. The current text and multimodal model IDs include:

### Qwen 3 Flagship

- `qwen3.7-max`, `qwen3.7-max-us`, `qwen3.7-max-preview`, `qwen3.7-max-2026-05-17`, `qwen3.7-max-2026-05-20`, `qwen3.7-max-2026-06-08` - Current flagship and regional/snapshot variants
- `qwen3.7-plus`, `qwen3.7-plus-us`, `qwen3.7-plus-2026-05-26` - Current multimodal Plus models
- `qwen3.6-plus`, `qwen3.6-plus-2026-04-02`, `qwen3.6-flash`, `qwen3.6-flash-2026-04-16`, `qwen3.6-max-preview` - Qwen3.6 hosted models
- `qwen3.6-35b-a3b`, `qwen3.6-27b` - Qwen3.6 open-source models
- `qwen3.5-plus`, `qwen3.5-plus-2026-02-15`, `qwen3.5-plus-2026-04-20`, `qwen3.5-flash`, `qwen3.5-flash-2026-02-23`, `qwen3.5-ocr`, `qwen3.5-397b-a17b`, `qwen3.5-122b-a10b`, `qwen3.5-35b-a3b`, `qwen3.5-27b` - Qwen3.5 hosted and open-source models
- `qwen3-max` - Next-generation flagship with reasoning and tool integration
- `qwen3-max-preview` - Preview version with thinking mode support
- `qwen3-max-2026-01-23` - January 2026 snapshot
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
  - `deepseek-v4-pro` / `deepseek-v4-flash` - Current DeepSeek V4 models
  - `vanchin/deepseek-v4-pro` - Current Kuaishou Wanqing-hosted DeepSeek V4 model
  - `deepseek-v3.2` / `deepseek-v3.2-exp` / `deepseek-v3.1` / `deepseek-v3` - DeepSeek V3 models
  - `deepseek-r1` / `deepseek-r1-0528` - DeepSeek reasoning models
  - `deepseek-r1-distill-qwen-{1.5b,7b,14b,32b}` - Distilled on Qwen2.5
  - `deepseek-r1-distill-llama-{8b,70b}` - Distilled on Llama

### Vision & Multimodal

**Commercial:**

- `qwen3-vl-plus` / `qwen3-vl-plus-2025-12-19` / `qwen3-vl-plus-2025-09-23` - High-res image support with long context (thinking & non-thinking modes)
- `qwen3-vl-flash` / `qwen3-vl-flash-us` / `qwen3-vl-flash-2025-10-15` - Fast vision model with thinking mode support
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

- `kimi/kimi-k3`, `kimi-k2.7-code`, `kimi/kimi-k2.7-code-highspeed`, `kimi-k2.6`, `kimi-k2.5`, `moonshot-kimi-k2-instruct`

**GLM (Zhipu AI):**

- `glm-5.2`, `glm-5.2-us`, `glm-5.2-fast-preview`, `glm-5.1`, `glm-5`, `ZHIPU/GLM-5.2`

**MiniMax:**

- `MiniMax-M2.5`, `MiniMax-M2.1`, `MiniMax/MiniMax-M3`, `MiniMax/MiniMax-M2.7`, `MiniMax/MiniMax-M2.5`, `MiniMax/MiniMax-M2.1`

**Xiaomi MiMo and StepFun:**

- `xiaomi/mimo-v2.5-pro`, `stepfun/step-3.7-flash`

Kimi and MiniMax direct-supply models use fixed sampling defaults. Promptfoo omits the incompatible defaults automatically; leave options such as `temperature` and `top_p` unset for these models.

For DeepSeek V4, GLM 5, Kimi K3, and StepFun, `config.reasoning_effort` is forwarded to the model when set. Use `config.passthrough` for provider-specific controls such as `enable_thinking`.

### Embeddings

- `text-embedding-v3` - 1,024d vectors, 8,192 token limit, 50+ languages
- `text-embedding-v4` - Latest Qwen3-Embedding with flexible dimensions (64-2048d), 100+ languages

### Image Generation

- `qwen-image-plus` - Text-to-image with complex text rendering (Chinese/English)

For the latest availability, see the [official Model Studio model catalog](https://help.aliyun.com/en/model-studio/text-generation-model/), which is updated frequently.

## Additional Configuration

- `vl_high_resolution_images`: bool - Increases image token limit from 1,280 to 16,384 (qwen-vl-max only)

Standard [OpenAI parameters](/docs/providers/openai/#configuring-parameters) (temperature, max_tokens) are supported. Base URL: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` (or `https://dashscope.aliyuncs.com/compatible-mode/v1` for the Beijing region).

For API usage details, see the [Alibaba Cloud documentation](https://help.aliyun.com/en/model-studio/qwen-api-via-openai-chat-completions).

## See Also

- [OpenAI Provider](/docs/providers/openai)

## Reference

- [Alibaba Cloud Model Studio model lifecycle](https://help.aliyun.com/en/model-studio/newly-released-models)
