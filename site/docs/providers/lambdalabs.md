---
sidebar_label: Lambda Labs
---

# Lambda Labs

This provider enables you to use Lambda Labs models through their [Inference API](https://docs.lambda.ai/public-cloud/lambda-inference-api/).

Lambda Labs offers an OpenAI-compatible API for various large language models including Llama models, DeepSeek, Hermes, and more. You can use it as a drop-in replacement for applications currently using the [OpenAI API](/docs/providers/openai/).

## Setup

Generate a Cloud API key from the [Lambda Cloud dashboard](https://cloud.lambdalabs.com/api-keys). Then set the `LAMBDA_API_KEY` environment variable or pass it via the `apiKey` configuration field.

```bash
export LAMBDA_API_KEY=your_api_key_here
```

Or in your config:

```yaml
providers:
  - id: lambdalabs:chat:llama-4-maverick-17b-128e-instruct-fp8
    config:
      apiKey: your_api_key_here
```

## Provider Format

The Lambda Labs provider supports the following formats:

- `lambdalabs:chat:<model name>` - Uses any model with the chat completion interface
- `lambdalabs:completion:<model name>` - Uses any model with the completion interface
- `lambdalabs:<model name>` - Defaults to the chat completion interface

## Available Models

The Lambda Labs Inference API officially supports these models:

- `deepseek-llama3.3-70b` - DeepSeek Llama 3.3 70B model
- `deepseek-r1-671b` - DeepSeek R1 671B model
- `hermes3-405b` - Hermes 3 405B model
- `hermes3-70b` - Hermes 3 70B model
- `hermes3-8b` - Hermes 3 8B model
- `lfm-40b` - Liquid Foundation Model 40B
- `llama-4-maverick-17b-128e-instruct-fp8` - Llama 4 Maverick 17B model with 128 expert MoE
- `llama-4-scout-17b-16e-instruct` - Llama 4 Scout 17B model with 16 expert MoE
- `llama3.1-405b-instruct-fp8` - Llama 3.1 405B Instruct model
- `llama3.1-70b-instruct-fp8` - Llama 3.1 70B Instruct model
- `llama3.1-8b-instruct` - Llama 3.1 8B Instruct model
- `llama3.1-nemotron-70b-instruct-fp8` - Llama 3.1 Nemotron 70B Instruct model
- `llama3.2-11b-vision-instruct` - Llama 3.2 11B Vision model (supports images)
- `llama3.2-3b-instruct` - Llama 3.2 3B Instruct model
- `llama3.3-70b-instruct-fp8` - Llama 3.3 70B Instruct model
- `qwen25-coder-32b-instruct` - Qwen 2.5 Coder 32B Instruct model

To get the current list of available models, use the `/models` endpoint:

```bash
curl https://api.lambda.ai/v1/models -H "Authorization: Bearer your_api_key_here"
```

## Parameters

The provider accepts all standard OpenAI parameters:

- `temperature` - Controls randomness (0.0 to 1.0)
- `max_tokens` - Maximum number of tokens to generate
- `top_p` - Nucleus sampling parameter
- `stop` - Sequences where the API will stop generating further tokens
- `frequency_penalty` - Penalizes frequent tokens
- `presence_penalty` - Penalizes new tokens based on presence in text

## Example Configuration

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Lambda Labs model evaluation
prompts:
  - You are an expert in {{topic}}. Explain {{question}} in simple terms.
providers:
  - id: lambdalabs:chat:llama-4-maverick-17b-128e-instruct-fp8
    config:
      temperature: 0.7
      max_tokens: 1024
  - id: lambdalabs:chat:llama3.3-70b-instruct-fp8
    config:
      temperature: 0.7
      max_tokens: 1024
tests:
  - vars:
      topic: quantum computing
      question: Explain quantum entanglement in simple terms
    assert:
      - type: contains-any
        value: ['entangled', 'correlated', 'quantum state']
  - vars:
      topic: machine learning
      question: What is the difference between supervised and unsupervised learning?
    assert:
      - type: contains
        value: 'labeled data'
```

## See Also

- [OpenAI Provider](/docs/providers/openai) - Compatible API format used by Lambda Labs
- [Configuration Reference](/docs/configuration/reference.md) - Full configuration options for providers
- [Lambda Labs Examples](https://github.com/promptfoo/promptfoo/tree/main/examples/lambdalabs) - Example configurations using Lambda Labs models
- [Lambda Labs API Documentation](https://docs.lambda.ai/public-cloud/lambda-inference-api/) - Official API reference
