---
title: Alibaba Cloud (Qwen) Provider
sidebar_label: Alibaba Cloud (Qwen)
description: Configure Alibaba Cloud's DashScope API for Qwen chat, reasoning, vision, and embedding models in Promptfoo.
keywords:
  [alibaba, qwen, qwen4, qwen3, dashscope, deepseek, qwq, reasoning, vision, multimodal, llm]
---

# Alibaba Cloud (Qwen)

[Alibaba Cloud's DashScope API](https://www.alibabacloud.com/help/en/model-studio/getting-started/models) provides OpenAI-compatible access to Qwen language models. Use [OpenAI provider options](/docs/providers/openai/) supported by your chosen model.

## Setup

To use Alibaba Cloud's API, set the `DASHSCOPE_API_KEY` environment variable or specify via `apiKey` in the configuration file:

```sh
export DASHSCOPE_API_KEY=your_api_key_here
```

## Configuration

The provider uses [OpenAI provider options](/docs/providers/openai); support varies by model. Example:

```yaml
providers:
  - alibaba:qwen4-max # Simple usage
  - id: alibaba:qwen3.7-plus # Aliases: alicloud:, aliyun:, dashscope:
    config:
      temperature: 0.7
      apiKey: your_api_key_here # Alternative to DASHSCOPE_API_KEY environment variable
      apiBaseUrl: https://dashscope-intl.aliyuncs.com/compatible-mode/v1 # Optional: Override default API base URL
```

:::note

The equivalent provider prefixes are `alicloud:`, `aliyun:`, and `dashscope:`. For new configurations, Alibaba recommends `qwen3.7-plus` for balanced use, `qwen3.8-flash` for lower cost, or `qwen4-max` for stronger reasoning. Check the [model catalog for your region](https://www.alibabacloud.com/help/en/model-studio/text-generation-model); model availability differs by region.

If you're using the Alibaba Cloud Beijing region console, switch the base URL to `https://dashscope.aliyuncs.com/compatible-mode/v1` instead of the international endpoint.

:::

## Supported Models

The built-in Alibaba provider implements OpenAI-compatible Chat Completions and text embeddings. The catalog below also lists separate [realtime](https://www.alibabacloud.com/help/en/model-studio/omni), [speech recognition](https://www.alibabacloud.com/help/en/model-studio/qwen-asr-realtime-interaction-process), and [image generation](https://www.alibabacloud.com/help/en/model-studio/qwen-image-generation-and-editing-api-reference) services. Listing a model here does not add those endpoints to this provider. Choose a model supported by your selected endpoint and region.

### Qwen 4

- `qwen4-max` - Flagship model with text, image, and video input, thinking enabled by default, and a 1M-token context window

### Qwen 3 Flagship

- `qwen3.8-max` / `qwen3.8-max-0902` - Qwen3.8 flagship with text, image, and video input and a 1M-token context window
- `qwen3.8-flash` - Faster Qwen3.8 model with a 1M-token context window
- `qwen3.7-plus` / `qwen3.7-plus-2026-05-26` - General-purpose model with thinking, vision, and tool calling
- `qwen3.7-flash` / `qwen3.7-flash-2026-07-15` - Lower-cost Qwen3.7 model
- `qwen3.7-max` / `qwen3.7-max-2026-06-08` - Previous flagship
- `qwen3.6-plus` / `qwen3.6-flash` and `qwen3.5-plus` / `qwen3.5-flash` - Previous model families
- `qwen3-max` - Supports reasoning and tool calling
- `qwen3-max-preview` - Preview version with thinking mode support
- `qwen3-max-2025-09-23` - September 2025 snapshot
- `qwen-max` - 32K context (30,720 in, 8,192 out)
- `qwen-max-latest` - Always updated to latest version
- `qwen-max-2025-01-25` - January 2025 snapshot
- `qwen-plus` / `qwen-plus-latest` - 128K-1M context (thinking & non-thinking modes)
- `qwen-plus-2025-09-11`, `qwen-plus-2025-07-28`, `qwen-plus-2025-07-14`, `qwen-plus-2025-04-28`, `qwen-plus-2025-01-25` - Dated snapshots
- `qwen-flash` / `qwen-flash-2025-07-28` - Latency-optimized general model
- `qwen-turbo` / `qwen-turbo-latest` / `qwen-turbo-2025-04-28` / `qwen-turbo-2024-11-01` - Earlier low-latency model; see `qwen-flash`
- `qwen-long-latest` / `qwen-long-2025-01-25` - 10M context for long-text analysis, summarization, and extraction

### Qwen 3 Omni & Realtime

- `qwen3.8-omni-flash` - Text output from text, image, audio, and video input through Chat Completions; use the separate realtime API for `qwen3.8-omni-flash-realtime`
- `qwen3-omni-flash` / `qwen3-omni-flash-2025-09-15` - Supports speech and vision in thinking and non-thinking modes
- `qwen3.5-omni-plus` / `qwen3.5-omni-flash` and their `-2026-03-15` snapshots - Text, image, audio, and video input with text and speech output; use the separate realtime API for the `-realtime` variants
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
  - `deepseek-v4.1-flash` / `deepseek-v4.1-flash-1017` - Hosted DeepSeek V4.1 Flash models with text and image input; these IDs differ from the direct DeepSeek API
  - `deepseek-v4-pro` / `deepseek-v4-pro-0813` / `deepseek-v4-flash-0731` - Hosted DeepSeek V4 Pro and Flash models
  - `deepseek-v3.2-exp` / `deepseek-v3.1` / `deepseek-v3` - DeepSeek V3 models
  - `deepseek-r1` / `deepseek-r1-0528` - DeepSeek reasoning models
  - `deepseek-r1-distill-qwen-{1.5b,7b,14b,32b}` - Distilled on Qwen2.5
  - `deepseek-r1-distill-llama-{8b,70b}` - Distilled on Llama

### Vision & Multimodal

**Commercial:**

- `qwen3-vl-plus` / `qwen3-vl-plus-2025-09-23` - High-res image support with long context (thinking & non-thinking modes)
- `qwen3-vl-flash` / `qwen3-vl-flash-2025-10-15` - Fast vision model with thinking mode support
- `qwen-vl-max` - 7.5K context, 1,280 tokens/image
- `qwen-vl-plus` - High-res image support
- `qwen-vl-ocr` / `qwen-vl-ocr-2025-11-20` / `qwen-vl-ocr-2024-10-28` - OCR-optimized for documents, tables, handwriting (30+ languages)
- `qwen3.5-ocr` - OCR model for document parsing, text localization, and key information extraction

**Open-source:**

- `qwen3-vl-235b-a22b-thinking` / `qwen3-vl-235b-a22b-instruct` - 235B parameter Qwen3-VL
- `qwen3-vl-32b-thinking` / `qwen3-vl-32b-instruct` - 32B parameter Qwen3-VL
- `qwen3-vl-30b-a3b-thinking` / `qwen3-vl-30b-a3b-instruct` - 30B parameter Qwen3-VL
- `qwen3-vl-8b-thinking` / `qwen3-vl-8b-instruct` - 8B parameter Qwen3-VL
- `qwen2.5-vl-{72b,7b,3b}-instruct` - Qwen 2.5 VL series
- `qwen2-vl-{72b,7b,2b}-instruct` - Qwen 2 VL series

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
- `qwen-mt-{plus,flash,turbo}` - Machine translation (92 languages)
- `qwen-mt-lite` - Lower-cost machine translation (32 languages)
- `qwen-plus-character` / `qwen-flash-character` / `qwen-plus-character-ja` - Role-playing models (`-ja` for Japanese)
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

Open-source Qwen3 models with thinking mode support:

- `qwen3.8-2.4t-a95b` - Qwen3.8 MoE text model (2.4T total, about 95B active parameters) that always thinks
- `qwen3.8-27b` / `qwen3.6-27b` - 27B dense vision-language models; `qwen3.8-27b` thinks by default
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

- `kimi-k3.1-pro` - Kimi K3.1 Pro with text and image input, thinking on by default, and a 1M-token context window
- `kimi-k3` - Kimi K3 with vision input and a 1M-token context window; `kimi/kimi-k3` is served directly by Moonshot AI
- `kimi-k2.7-code` - Coding model with text, image, and video input that always thinks
- `kimi-k2.6` - Earlier Kimi model with a 256K context window
- `kimi-k2.5` - Earlier Kimi model with text and image input
- `moonshot-kimi-k2-instruct` - First open-source trillion-parameter MoE model in China (activates 32B parameters)

**Z.AI (GLM):** `glm-5.3` (always thinks), `glm-5.3-prime`, `glm-5.2`, `glm-5.2-fast-preview`, `glm-5.1`, and `glm-5`, plus `ZHIPU/GLM-5.3` and `ZHIPU/GLM-5.2` served directly by Zhipu AI. Check the [regional model catalog](https://www.alibabacloud.com/help/en/model-studio/models) for access and endpoint requirements.

**MiniMax:** `MiniMax-M2.5`, which always thinks.

**MindLab:** `mindlab/macaron-v1.1-venti-pro`, `mindlab/macaron-v1.1-venti`, `mindlab/macaron-v1.1-coding-venti`, and `mindlab/macaron-v1-tall`, available in the Singapore region.

### Embeddings

Use `alibaba:embedding:<model>` for embeddings. The `alibaba:<model>` shorthand sends chat requests.

- `text-embedding-v3` - 1,024d vectors, 8,192 token limit, 50+ languages
- `text-embedding-v4` - Latest Qwen3-Embedding with flexible dimensions (64-2048d), 100+ languages
- `qwen3.7-text-embedding` - Newer Qwen3.7 text embeddings; availability depends on the region

```yaml
defaultTest:
  options:
    provider:
      embedding:
        id: alibaba:embedding:text-embedding-v4
```

### Image Generation

The `alibaba` provider does not call image-generation endpoints. To use models such as `qwen-image-plus`, configure the [HTTP provider](/docs/providers/http/) for [Alibaba's image API](https://www.alibabacloud.com/help/en/model-studio/qwen-image-api).

See the [DashScope model catalog](https://www.alibabacloud.com/help/en/model-studio/getting-started/models) for availability.

## Additional Configuration

Put DashScope-specific request fields under `config.passthrough`. For example, `enable_thinking` controls thinking mode on Qwen4, Qwen3.8, and Qwen3.7 chat models:

```yaml
providers:
  - id: alibaba:qwen3.8-max
    config:
      passthrough:
        enable_thinking: true
```

Some models think by default and count their reasoning toward `max_tokens`: Qwen4, `deepseek-v4.1-flash`, `deepseek-v4-pro`, `deepseek-v4-pro-0813`, `deepseek-v4-flash-0731`, `glm-5.3`, and `glm-5.2`. For these models, promptfoo omits its default `max_tokens` cap, forwards `reasoning_effort`, and sends an explicit `max_tokens` or `max_completion_tokens` as `max_completion_tokens`:

```yaml
providers:
  - id: alibaba:qwen4-max
    config:
      reasoning_effort: low # low, high (default), or xhigh; none turns thinking off
      max_completion_tokens: 8192 # Reasoning and answer combined
```

Supported `reasoning_effort` values vary by model; see [Alibaba's Chat Completions reference](https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions). To limit Qwen4 reasoning by tokens instead, set `passthrough.thinking_budget` and leave `reasoning_effort` unset. Qwen4 does not accept both in one request. When a `glm-5.2` request sets `passthrough.thinking_budget`, its `max_tokens` limits only the answer, so promptfoo sends it unchanged. Set `passthrough.enable_thinking: false` to turn thinking off on models that support both modes; `glm-5.3` always thinks.

Standard [OpenAI parameters](/docs/providers/openai/#configuring-parameters) (temperature, max_tokens) are supported. Base URL: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` (or `https://dashscope.aliyuncs.com/compatible-mode/v1` for the Beijing region).

For API usage details, see [Alibaba Cloud documentation](https://www.alibabacloud.com/help/en/model-studio/getting-started/models).

## See Also

- [OpenAI Provider](/docs/providers/openai)

## Reference

- [Alibaba Cloud DashScope documentation](https://www.alibabacloud.com/help/en/model-studio/getting-started/models)
