# Lambda Labs

This provider allows you to use Lambda Labs models via their [Inference API](https://docs.lambdalabs.com/api).

Lambda Labs offers an OpenAI-compatible API for various large language models including Llama models, DeepSeek, Hermes, and more.

## Setup

To use the Lambda Labs API, set the `LAMBDA_API_KEY` environment variable or pass it via the `apiKey` field in your configuration file.

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

Here are some of the models available via Lambda Labs (check their API for the most updated list):

- `llama-4-maverick-17b-128e-instruct-fp8`
- `llama-4-scout-17b-16e-instruct`
- `llama3.3-70b-instruct-fp8`
- `llama3.2-3b-instruct`
- `llama3.2-11b-vision-instruct`
- `llama3.1-8b-instruct`
- `llama3.1-70b-instruct-fp8`
- `llama3.1-405b-instruct-fp8`
- `llama3.1-nemotron-70b-instruct-fp8`
- `deepseek-llama3.3-70b`
- `deepseek-r1-671b`
- `hermes3-405b`
- `hermes3-70b`
- `hermes3-8b`
- `lfm-40b`
- `qwen25-coder-32b-instruct`

You can get the current list of models by using the `/models` endpoint.

## Example Configuration

```yaml
providers:
  - id: lambdalabs:chat:llama-4-maverick-17b-128e-instruct-fp8
    config:
      temperature: 0.7
      max_tokens: 2048
```

## Parameters

The provider accepts all standard OpenAI parameters such as:

- `temperature`
- `max_tokens`
- `top_p`
- `stop`
- `frequency_penalty`
- `presence_penalty`

## Example Usage

```yaml
providers:
  - id: lambdalabs:chat:llama-4-maverick-17b-128e-instruct-fp8
  - id: lambdalabs:chat:llama3.3-70b-instruct-fp8

prompts:
  - "Explain the concept of {{concept}} in simple terms"

tests:
  - vars:
      concept: "quantum computing"
  - vars:
      concept: "artificial intelligence"
``` 