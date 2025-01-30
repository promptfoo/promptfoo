# Alibaba Cloud (Qwen)

[Alibaba Cloud](https://www.alibabacloud.com/help/en/model-studio/getting-started/models) provides access to their Qwen series of language models through DashScope, an API compatible with OpenAI's interface.

The Alibaba Cloud provider is compatible with all the options provided by the [OpenAI provider](/docs/providers/openai/).

Here's an example of how to configure the provider to use the `qwen-plus` model:

```yaml
providers:
  - id: alibaba:qwen-plus
    config:
      temperature: 0.7
      apiKeyEnvar: ALICLOUD_API_KEY
```

The provider supports multiple aliases: `alibaba:`, `alicloud:`, `aliyun:`, and `dashscope:` - they all work the same way.

If you prefer to use an environment variable directly, set `ALICLOUD_API_KEY`.

You can specify the model type explicitly:

```yaml
providers:
  - id: alibaba:chat:qwen-max
  - id: alibaba:completion:qwen-turbo
  - id: alibaba:vl:qwen-vl-max # For visual language models
  - id: alibaba:embedding:text-embedding-v3 # For text embeddings
```

If no type is specified, it defaults to the chat completion type.

## Available Models

### Flagship Models (Commercial)

- `qwen-max` - Most powerful model (32K context)

  - Best for complex and multi-step tasks
  - Context: 32,768 tokens (30,720 input, 8,192 output)
  - Also available as snapshot: `qwen-max-2025-01-25` or `qwen-max-0125`

- `qwen-plus` - Balanced performance and cost (128K context)

  - Ideal for moderately complex tasks
  - Context: 131,072 tokens (129,024 input, 8,192 output)

- `qwen-turbo` - Fast and cost-effective (1M context)
  - Best for simple tasks
  - Context: 1,000,000 tokens (1,000,000 input, 8,192 output)

### Visual Language Models

- `qwen-vl-max` - Most capable visual model

  - Enhanced visual reasoning and instruction-following
  - Context: 7,500 tokens (6,000 input, 1,500 output)
  - Up to 1,280 tokens per image

- `qwen-vl-plus` - Enhanced visual model
  - Improved detail and text recognition
  - Supports high-resolution images (millions of pixels)
  - Various aspect ratios supported

### Qwen 2.5 Series (Open Source)

Latest series with improved capabilities:

- Enhanced instruction following and long-text generation
- Better at structured data and JSON output
- Supports 29+ languages
- All models support 131,072 context (129,024 input, 8,192 output)

Available models:

- `qwen2.5-72b-instruct` - 72B parameters
- `qwen2.5-32b-instruct` - 32B parameters
- `qwen2.5-14b-instruct` - 14B parameters
- `qwen2.5-7b-instruct` - 7B parameters

### Qwen 2 Series (Open Source)

- `qwen2-72b-instruct` - 72B parameters (131K context)
- `qwen2-57b-a14b-instruct` - 57B parameters (65K context)
- `qwen2-7b-instruct` - 7B parameters (131K context)

### Qwen 1.5 Series (Open Source)

All models support 8,000 context (6,000 input, 2,000 output):

- `qwen1.5-110b-chat` - 110B parameters
- `qwen1.5-72b-chat` - 72B parameters
- `qwen1.5-32b-chat` - 32B parameters
- `qwen1.5-14b-chat` - 14B parameters
- `qwen1.5-7b-chat` - 7B parameters

### Text Embedding Models

- `text-embedding-v3`
  - 1,024-dimensional vectors
  - Up to 8,192 tokens per input
  - Supports 50+ languages including Chinese, English, Spanish, French, etc.

For more information on the available models and API usage, refer to the [Alibaba Cloud documentation](https://www.alibabacloud.com/help/en/model-studio/getting-started/models).
