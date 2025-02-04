# Alibaba Cloud (Qwen)

[Alibaba Cloud's DashScope API](https://www.alibabacloud.com/help/en/model-studio/getting-started/models) provides OpenAI-compatible access to Qwen language models. Compatible with all [OpenAI provider](/docs/providers/openai/) options in promptfoo.

## Configuration

```yaml
providers:
  - qwen-max
  - id: alibaba:qwen-plus # Aliases: alicloud:, aliyun:, dashscope:
    config:
      temperature: 0.7
      apiKeyEnvar: 01234567890123456789012345678901 # or set `DASHSCOPE_API_KEY` to your Alibaba Cloud API key
```

## Models

### Commercial Models

- `qwen-max` - 32K context (30,720 in, 8,192 out)
- `qwen-plus` - 128K context (129,024 in, 8,192 out)
- `qwen-turbo` - 1M context (1M in, 8,192 out)

Snapshots available with `-latest` or date suffix (e.g., `qwen-max-2025-01-25`)

### Visual Models

- `qwen-vl-max` - 7.5K context, 1,280 tokens/image
- `qwen-vl-plus` - High-res image support
- Qwen 2.5 VL: `qwen2.5-vl-{72b,7b,3b}-instruct`

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

## Additional Configuration

- `vl_high_resolution_images`: bool - Increases image token limit from 1,280 to 16,384 (qwen-vl-max only)

Standard [OpenAI parameters](/docs/providers/openai/#configuring-parameters) (temperature, max_tokens) are supported. Base URL: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`

For API usage details, see [Alibaba Cloud documentation](https://www.alibabacloud.com/help/en/model-studio/getting-started/models).
