---
sidebar_label: Alibaba Cloud (Qwen)
description: "Deploy Alibaba Cloud's Qwen models and AI services for enterprise applications with regional compliance and scalability"
---

# Alibaba Cloud (Qwen)

[Alibaba Cloud's DashScope API](https://www.alibabacloud.com/help/en/model-studio/getting-started/models) provides OpenAI-compatible access to Qwen language models. Compatible with all [OpenAI provider](/docs/providers/openai/) options in promptfoo.

## Configuration

```yaml
providers:
  - alibaba:qwen-max
  - id: alibaba:qwen-plus # Aliases: alicloud:, aliyun:, dashscope:
    config:
      temperature: 0.7
      apiKeyEnvar: 01234567890123456789012345678901 # or set `DASHSCOPE_API_KEY` to your Alibaba Cloud API key
      apiBaseUrl: https://dashscope-intl.aliyuncs.com/compatible-mode/v1 # Optional: Override default API base URL
```

:::note
If you're using the Alibaba Cloud Beijing region console, switch the base URL to `https://dashscope.aliyuncs.com/compatible-mode/v1` instead of the international endpoint.
:::

## Models

### Qwen 3 Flagship

- `qwen3-max` - Next-generation flagship with reasoning and tool integration
- `qwen-max` - 32K context (30,720 in, 8,192 out)
- `qwen-plus` - 128K context (129,024 in, 8,192 out)
- `qwen-turbo` - 1M context (1M in, 8,192 out)
- `qwen-flash` - Latency-optimized general model

- Snapshots available with `-latest` or date suffix (e.g., `qwen-max-2025-01-25`)

### Qwen 3 Omni & Realtime

- `qwen3-omni-flash` - Multimodal flagship with speech + vision support
- `qwen3-omni-flash-realtime` - Streaming realtime variant for interactive experiences
- `qwen3-omni-30b-a3b-captioner` - Dedicated captioning model

### Reasoning & Research

- `qwq-plus` - Alibaba's reasoning model
- `qwen-deep-research` - Long-form research assistant
- `qvq-max` / `qvq-72b-preview` - QVQ creative reasoning models
- `deepseek-r1` / `deepseek-v3` families - Distilled reasoning models hosted by Alibaba Cloud

### Vision & Multimodal

- `qwen3-vl-plus` - High-res image support with long context
- `qwen3-vl-{30b-a3b,235b-a22b}-{thinking,instruct}` - Open-source Qwen3 vision models
- `qwen-vl-max` - 7.5K context, 1,280 tokens/image
- `qwen-vl-plus` - High-res image support
- Qwen 2.5 VL: `qwen2.5-vl-{72b,7b,3b}-instruct`
- `qwen-vl-ocr` - OCR-optimized variant

### Audio & Speech

- `qwen3-asr-flash` - Real-time speech recognition
- `qwen3-omni-flash-realtime` - Supports speech streaming

### Coding & Math

- `qwen3-coder-plus` / `qwen3-coder-flash` - Latest hosted coding models
- `qwen3-coder-{480b-a35b,30b-a3b}-instruct` - Open-source Qwen3 coder models
- `qwen2.5-math-{72b,7b,1.5b}-instruct` - Math-focused models
- `qwen-math-{plus,turbo}` - Math reasoning and tutoring
- `qwen-mt-{plus,turbo}` - Machine translation tuned models
- `qwen-doc-turbo` - Document mining

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

### Embeddings

- `text-embedding-v3` - 1,024d vectors, 8,192 token limit, 50+ languages

For the latest availability, see the [official DashScope model catalog](https://www.alibabacloud.com/help/en/model-studio/getting-started/models), which is updated frequently.

## Additional Configuration

- `vl_high_resolution_images`: bool - Increases image token limit from 1,280 to 16,384 (qwen-vl-max only)

Standard [OpenAI parameters](/docs/providers/openai/#configuring-parameters) (temperature, max_tokens) are supported. Base URL: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` (or `https://dashscope.aliyuncs.com/compatible-mode/v1` for the Beijing region).

For API usage details, see [Alibaba Cloud documentation](https://www.alibabacloud.com/help/en/model-studio/getting-started/models).
