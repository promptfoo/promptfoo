---
sidebar_label: OpenRouter
---

# OpenRouter

[OpenRouter](https://openrouter.ai/) provides a unified interface for accessing various LLM APIs, including models from OpenAI, Meta, Perplexity, and others. It follows the OpenAI API format - see our [OpenAI provider documentation](/docs/providers/openai/) for base API details.

## Setup

1. Get your API key from [OpenRouter](https://openrouter.ai/)
2. Set the `OPENROUTER_API_KEY` environment variable or specify `apiKey` in your config

## Available Models

Latest releases:

| **Model ID**                                                                                               | **Context (tokens)** |
| ---------------------------------------------------------------------------------------------------------- | -------------------- |
| [amazon/nova-lite-v1](https://openrouter.ai/amazon/nova-lite-v1)                                           | 300,000              |
| [amazon/nova-micro-v1](https://openrouter.ai/amazon/nova-micro-v1)                                         | 128,000              |
| [anthracite-org/magnum-v4-72b](https://openrouter.ai/anthracite-org/magnum-v4-72b)                         | 16,384               |
| [anthropic/claude-3-haiku](https://openrouter.ai/anthropic/claude-3-haiku)                                 | 200,000              |
| [anthropic/claude-3-opus](https://openrouter.ai/anthropic/claude-3-opus)                                   | 200,000              |
| [anthropic/claude-3.5-sonnet](https://openrouter.ai/anthropic/claude-3.5-sonnet)                           | 200,000              |
| [anthropic/claude-3.5-sonnet:beta](https://openrouter.ai/anthropic/claude-3.5-sonnet:beta)                 | 200,000              |
| [cohere/command-r-08-2024](https://openrouter.ai/cohere/command-r-08-2024)                                 | 128,000              |
| [deepseek/deepseek-r1](https://openrouter.ai/deepseek/deepseek-r1)                                         | 64,000               |
| [deepseek/deepseek-r1-distill-llama-70b](https://openrouter.ai/deepseek/deepseek-r1-distill-llama-70b)     | 131,072              |
| [deepseek/deepseek-v3-base:free](https://openrouter.ai/deepseek/deepseek-v3-base)                          | 131,072              |
| [google/gemini-2.0-flash-exp:free](https://openrouter.ai/google/gemini-2.0-flash-exp:free)                 | 1,048,576            |
| [google/gemini-2.5-pro-preview](https://openrouter.ai/google/gemini-2.5-pro-preview)                       | 1,000,000            |
| [google/gemini-flash-1.5](https://openrouter.ai/google/gemini-flash-1.5)                                   | 1,000,000            |
| [google/gemini-flash-1.5-8b](https://openrouter.ai/google/gemini-flash-1.5-8b)                             | 1,000,000            |
| [google/gemini-pro-1.5](https://openrouter.ai/google/gemini-pro-1.5)                                       | 2,000,000            |
| [gryphe/mythomax-l2-13b](https://openrouter.ai/gryphe/mythomax-l2-13b)                                     | 4,096                |
| [meta-llama/llama-3-70b-instruct](https://openrouter.ai/meta-llama/llama-3-70b-instruct)                   | 8,192                |
| [meta-llama/llama-3-8b-instruct](https://openrouter.ai/meta-llama/llama-3-8b-instruct)                     | 8,192                |
| [meta-llama/llama-3-8b-instruct:extended](https://openrouter.ai/meta-llama/llama-3-8b-instruct:extended)   | 16,384               |
| [meta-llama/llama-3.1-70b-instruct](https://openrouter.ai/meta-llama/llama-3.1-70b-instruct)               | 131,072              |
| [meta-llama/llama-3.1-8b-instruct](https://openrouter.ai/meta-llama/llama-3.1-8b-instruct)                 | 131,072              |
| [meta-llama/llama-3.2-1b-instruct](https://openrouter.ai/meta-llama/llama-3.2-1b-instruct)                 | 131,072              |
| [meta-llama/llama-3.2-3b-instruct](https://openrouter.ai/meta-llama/llama-3.2-3b-instruct)                 | 131,000              |
| [meta-llama/llama-3.2-11b-vision-instruct](https://openrouter.ai/meta-llama/llama-3.2-11b-vision-instruct) | 131,072              |
| [meta-llama/llama-3.3-70b-instruct](https://openrouter.ai/meta-llama/llama-3.3-70b-instruct)               | 131,072              |
| [meta-llama/llama-4-scout:free](https://openrouter.ai/meta-llama/llama-4-scout)                            | 512,000              |
| [meta-llama/llama-4-scout](https://openrouter.ai/meta-llama/llama-4-scout)                                 | 131,072              |
| [meta-llama/llama-4-maverick:free](https://openrouter.ai/meta-llama/llama-4-maverick)                      | 256,000              |
| [meta-llama/llama-4-maverick](https://openrouter.ai/meta-llama/llama-4-maverick)                           | 131,072              |
| [microsoft/phi-4](https://openrouter.ai/microsoft/phi-4)                                                   | 16,384               |
| [microsoft/wizardlm-2-8x22b](https://openrouter.ai/microsoft/wizardlm-2-8x22b)                             | 65,536               |
| [mistralai/codestral-2501](https://openrouter.ai/mistralai/codestral-2501)                                 | 256,000              |
| [mistralai/mistral-8b](https://openrouter.ai/mistralai/mistral-8b)                                         | 128,000              |
| [mistralai/mistral-nemo](https://openrouter.ai/mistralai/mistral-nemo)                                     | 131,072              |
| [mistralai/ministral-8b](https://openrouter.ai/mistralai/ministral-8b)                                     | 131,072              |
| [neversleep/llama-3-lumimaid-8b:extended](https://openrouter.ai/neversleep/llama-3-lumimaid-8b:extended)   | 24,576               |
| [openai/gpt-4.1-mini](https://openrouter.ai/openai/gpt-4.1-mini)                                           | 128,000              |
| [openai/gpt-4.1-mini-2024-07-18](https://openrouter.ai/openai/gpt-4.1-mini-2024-07-18)                     | 128,000              |
| [openhands/openhands-lm-32b-v0.1](https://openrouter.ai/openhands/openhands-lm-32b-v0.1)                   | 16,384               |
| [openrouter/quasar-alpha](https://openrouter.ai/openrouter/quasar-alpha)                                   | 1,000,000            |
| [eva-unit-01/eva-qwen-2.5-72b](https://openrouter.ai/eva-unit-01/eva-qwen-2.5-72b)                         | 16,384               |
| [eva-unit-01/eva-qwen-2.5-32b](https://openrouter.ai/eva-unit-01/eva-qwen-2.5-32b)                         | 16,384               |
| [qwen/qwen-2.5-coder-32b-instruct](https://openrouter.ai/qwen/qwen-2.5-coder-32b-instruct)                 | 33,000               |
| [qwen/qwen-2.5-7b-instruct](https://openrouter.ai/qwen/qwen-2.5-7b-instruct)                               | 32,768               |
| [qwen/qwen-2.5-72b-instruct](https://openrouter.ai/qwen/qwen-2.5-72b-instruct)                             | 32,768               |
| [qwen/qwq-32b-preview](https://openrouter.ai/qwen/qwq-32b-preview)                                         | 32,768               |
| [qwen/qvq-72b-preview](https://openrouter.ai/qwen/qvq-72b-preview)                                         | 128,000              |
| [scb10x/typhoon2-8b-instruct](https://openrouter.ai/scb10x/typhoon2-8b-instruct)                           | 8,192                |
| [scb10x/typhoon2-70b-instruct](https://openrouter.ai/scb10x/typhoon2-70b-instruct)                         | 8,192                |

For a complete list of 300+ models and detailed pricing, visit [OpenRouter Models](https://openrouter.ai/models).

## Basic Configuration

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: openrouter:meta-llama/llama-4-scout:free
    config:
      temperature: 0.7
      max_tokens: 1000

  - id: openrouter:meta-llama/llama-4-maverick:free
    config:
      temperature: 0.5
      max_tokens: 2000

  - id: openrouter:google/gemini-2.5-pro-preview
    config:
      temperature: 0.7
      max_tokens: 4000
```

## Features

- Access to 300+ models through a single API
- Mix free and paid models in your evaluations
- Support for text and multimodal (vision) models
- Compatible with OpenAI API format
- Pay-as-you-go pricing

## Thinking/Reasoning Models

Some models like Gemini 2.5 Pro include thinking tokens in their responses. You can control whether these are shown using the `showThinking` parameter:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openrouter:google/gemini-2.5-pro
    config:
      showThinking: false # Hide thinking content from output (default: true)
```

When `showThinking` is true (default), the output includes thinking content:

```
Thinking: <reasoning process>

<actual response>
```
