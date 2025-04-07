# Lambda Labs

This provider allows you to use Lambda Labs models via their [Inference API](https://docs.lambdalabs.com/api).

Lambda Labs offers an OpenAI-compatible API for various large language models including Llama models, DeepSeek, Hermes, and more. The API can be used as a drop-in replacement for applications currently using the OpenAI API.

## Setup

To use the Lambda Labs API, first generate a Cloud API key from the [Lambda Cloud dashboard](https://cloud.lambdalabs.com/api-keys). Then set the `LAMBDA_API_KEY` environment variable or pass it via the `apiKey` field in your configuration file.

```sh
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

The following models are officially supported by Lambda Labs Inference API:

- `deepseek-llama3.3-70b` - DeepSeek Llama 3.3 70B model
- `deepseek-r1-671b` - DeepSeek R1 671B model (extremely large model)
- `hermes3-405b` - Hermes 3 405B model
- `hermes3-70b` - Hermes 3 70B model
- `hermes3-8b` - Hermes 3 8B model
- `lfm-40b` - LFM 40B model
- `llama-4-maverick-17b-128e-instruct-fp8` - Llama 4 Maverick 17B model with 128 expert MoE (recommended)
- `llama-4-scout-17b-16e-instruct` - Llama 4 Scout 17B model with 16 expert MoE
- `llama3.1-405b-instruct-fp8` - Llama 3.1 405B Instruct model
- `llama3.1-70b-instruct-fp8` - Llama 3.1 70B Instruct model
- `llama3.1-8b-instruct` - Llama 3.1 8B Instruct model
- `llama3.1-nemotron-70b-instruct-fp8` - Llama 3.1 Nemotron 70B Instruct model
- `llama3.2-11b-vision-instruct` - Llama 3.2 11B Vision model (supports images)
- `llama3.2-3b-instruct` - Llama 3.2 3B Instruct model
- `llama3.3-70b-instruct-fp8` - Llama 3.3 70B Instruct model
- `qwen25-coder-32b-instruct` - Qwen 2.5 Coder 32B Instruct model

You can get the current list of models by using the `/models` endpoint:

```bash
curl https://api.lambda.ai/v1/models -H "Authorization: Bearer your_api_key_here"
```

## Example Configuration

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Comparing Lambda Labs LLM responses to technical questions
providers:
  - id: lambdalabs:chat:llama-4-maverick-17b-128e-instruct-fp8
    config:
      temperature: 0.7
      max_tokens: 2048
  - id: lambdalabs:chat:llama3.3-70b-instruct-fp8
    config:
      temperature: 0.7
      max_tokens: 2048

prompts:
  - file://prompts/technical_question.txt

tests:
  - vars:
      topic: quantum computing
      question: Explain quantum entanglement and why it matters for quantum computing
    assert:
      - type: contains
        value: "entangled particles"
  - vars:
      topic: machine learning
      question: What are the key differences between supervised and unsupervised learning?
    assert:
      - type: contains
        value: "labeled data"
```

## Parameters

The provider accepts all standard OpenAI parameters such as:

- `temperature` - Controls randomness (0.0 to 1.0)
- `max_tokens` - Maximum number of tokens to generate
- `top_p` - Nucleus sampling parameter
- `stop` - Sequences where the API will stop generating further tokens
- `frequency_penalty` - Penalizes frequent tokens
- `presence_penalty` - Penalizes new tokens based on presence in text

## Chat Messaging Format

When using the chat interface, you can construct a conversation using the standard OpenAI message format:

```yaml
providers:
  - id: lambdalabs:chat:llama-4-maverick-17b-128e-instruct-fp8

prompts:
  - messages:
      - role: system
        content: "You are an expert conversationalist who responds to the best of your ability."
      - role: user
        content: "{{question}}"

tests:
  - vars:
      question: "Who won the world series in 2020?"
  - vars:
      question: "What is the capital of France?"
```

## Complete Example

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Lambda Labs Llama 4 vs Llama 3.3 comparison
providers:
  - id: lambdalabs:chat:llama-4-maverick-17b-128e-instruct-fp8
  - id: lambdalabs:chat:llama3.3-70b-instruct-fp8

prompts:
  - |
    You are an AI assistant with expertise in {{topic}}. Provide a concise explanation 
    of {{concept}} and its importance in the field.
    
    Please explain {{concept}} in the context of {{topic}} in simple terms.

tests:
  - vars:
      topic: quantum computing
      concept: quantum entanglement
    assert:
      - type: llm-rubric
        value: "Does the response explain quantum entanglement clearly? Rate from 1-10."
      - type: contains-any
        value: ["entangled", "correlated", "quantum state"]
  - vars:
      topic: machine learning
      concept: neural networks
    assert:
      - type: llm-rubric
        value: "Does the response explain neural networks clearly? Rate from 1-10."
  - vars:
      topic: astronomy
      concept: dark matter
    assert:
      - type: llm-rubric
        value: "Does the response explain dark matter clearly? Rate from 1-10."
``` 