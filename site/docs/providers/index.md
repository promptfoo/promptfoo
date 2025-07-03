---
sidebar_label: LLM Providers
---

# LLM Providers

Providers in promptfoo are the interfaces to various language models and AI services. This guide will help you understand how to configure and use providers in your promptfoo evaluations.

## Quick Start

Here's a basic example of configuring providers in your promptfoo YAML config:

```yaml
providers:
  - anthropic:messages:claude-sonnet-4-20250514
  - openai:gpt-4.1
  - openai:o4-mini
  - google:gemini-2.5-pro-preview-06-05
  - vertex:gemini-2.5-pro-exp-03-25
  - mistral:magistral-medium-latest
  - mistral:magistral-small-latest
```

## Available Providers

| Api Providers                                       | Description                                            | Syntax & Example                                                 |
| --------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| [OpenAI](./openai.md)                               | GPT models including GPT-4.1 and reasoning models      | `openai:gpt-4.1` or `openai:o4-mini`                             |
| [Anthropic](./anthropic.md)                         | Claude models                                          | `anthropic:messages:claude-sonnet-4-20250514`                    |
| [HTTP](./http.md)                                   | Generic HTTP-based providers                           | `https://api.example.com/v1/chat/completions`                    |
| [Javascript](./custom-api.md)                       | Custom - JavaScript file                               | `file://path/to/custom_provider.js`                              |
| [Python](./python.md)                               | Custom - Python file                                   | `file://path/to/custom_provider.py`                              |
| [Shell Command](./custom-script.md)                 | Custom - script-based providers                        | `exec: python chain.py`                                          |
| [AI21 Labs](./ai21.md)                              | Jurassic and Jamba models                              | `ai21:jamba-1.5-mini`                                            |
| [AI/ML API](./aimlapi.md)                           | Tap into 300+ cutting-edge AI models with a single API | `aimlapi:chat:deepseek-r1`                                       |
| [AWS Bedrock](./aws-bedrock.md)                     | AWS-hosted models from various providers               | `bedrock:us.meta.llama3-2-90b-instruct-v1:0`                     |
| [Amazon SageMaker](./sagemaker.md)                  | Models deployed on SageMaker endpoints                 | `sagemaker:my-endpoint-name`                                     |
| [Azure OpenAI](./azure.md)                          | Azure-hosted OpenAI models                             | `azureopenai:gpt-4o-custom-deployment-name`                      |
| [Cerebras](./cerebras.md)                           | High-performance inference API for Llama models        | `cerebras:llama-4-scout-17b-16e-instruct`                        |
| [Adaline Gateway](./adaline.md)                     | Unified interface for multiple providers               | Compatible with OpenAI syntax                                    |
| [Cloudflare AI](./cloudflare-ai.md)                 | Cloudflare's OpenAI-compatible AI platform             | `cloudflare-ai:@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`     |
| [Cohere](./cohere.md)                               | Cohere's language models                               | `cohere:command`                                                 |
| [DeepSeek](./deepseek.md)                           | DeepSeek's language models                             | `deepseek:deepseek-chat`                                         |
| [F5](./f5.md)                                       | OpenAI-compatible AI Gateway interface                 | `f5:path-name`                                                   |
| [fal.ai](./fal.md)                                  | Image Generation Provider                              | `fal:image:fal-ai/fast-sdxl`                                     |
| [Fireworks AI](./fireworks.md)                      | Various hosted models                                  | `fireworks:accounts/fireworks/models/qwen-v2p5-7b`               |
| [GitHub](./github.md)                               | GitHub AI Gateway                                      | `github:gpt-4.1`                                                 |
| [Google AI Studio](./google.md)                     | Gemini models                                          | `google:gemini-2.5-pro`, `google:gemini-2.5-flash`               |
| [Google Vertex AI](./vertex.md)                     | Google Cloud's AI platform                             | `vertex:gemini-2.5-pro`, `vertex:gemini-2.5-flash`               |
| [Groq](./groq.md)                                   | High-performance inference API                         | `groq:llama-3.3-70b-versatile`                                   |
| [Helicone AI Gateway](./helicone.md)                | Self-hosted AI gateway for unified provider access     | `helicone:openai/gpt-4o`, `helicone:anthropic/claude-3-5-sonnet` |
| [Hyperbolic](./hyperbolic.md)                       | OpenAI-compatible Llama 3 provider                     | `hyperbolic:meta-llama/Llama-3.3-70B-Instruct`                   |
| [Hugging Face](./huggingface.md)                    | Access thousands of models                             | `huggingface:text-generation:gpt2`                               |
| [IBM BAM](./ibm-bam.md)                             | IBM's foundation models                                | `bam:chat:ibm/granite-13b-chat-v2`                               |
| [JFrog ML](./jfrog.md)                              | JFrog's LLM Model Library                              | `jfrog:llama_3_8b_instruct`                                      |
| [Lambda Labs](./lambdalabs.md)                      | Access Lambda Labs models via their Inference API      | `lambdalabs:model-name`                                          |
| [LiteLLM](./litellm.md)                             | Unified interface for multiple providers               | Compatible with OpenAI syntax                                    |
| [Mistral AI](./mistral.md)                          | Mistral's language models                              | `mistral:open-mistral-nemo`                                      |
| [OpenLLM](./openllm.md)                             | BentoML's model serving framework                      | Compatible with OpenAI syntax                                    |
| [OpenRouter](./openrouter.md)                       | Unified API for multiple providers                     | `openrouter:mistral/7b-instruct`                                 |
| [Perplexity AI](./perplexity.md)                    | Search-augmented chat with citations                   | `perplexity:sonar-pro`                                           |
| [Replicate](./replicate.md)                         | Various hosted models                                  | `replicate:stability-ai/sdxl`                                    |
| [Together AI](./togetherai.md)                      | Various hosted models                                  | Compatible with OpenAI syntax                                    |
| [Voyage AI](./voyage.md)                            | Specialized embedding models                           | `voyage:voyage-3`                                                |
| [vLLM](./vllm.md)                                   | Local                                                  | Compatible with OpenAI syntax                                    |
| [Ollama](./ollama.md)                               | Local                                                  | `ollama:llama3.2:latest`                                         |
| [LocalAI](./localai.md)                             | Local                                                  | `localai:gpt4all-j`                                              |
| [Llamafile](./llamafile.md)                         | OpenAI-compatible llamafile server                     | Uses OpenAI provider with custom endpoint                        |
| [llama.cpp](./llama.cpp.md)                         | Local                                                  | `llama:7b`                                                       |
| [Text Generation WebUI](./text-generation-webui.md) | Gradio WebUI                                           | Compatible with OpenAI syntax                                    |
| [WebSocket](./websocket.md)                         | WebSocket-based providers                              | `ws://example.com/ws`                                            |
| [Webhook](./webhook.md)                             | Custom - Webhook integration                           | `webhook:http://example.com/webhook`                             |
| [Echo](./echo.md)                                   | Custom - For testing purposes                          | `echo`                                                           |
| [Manual Input](./manual-input.md)                   | Custom - CLI manual entry                              | `promptfoo:manual-input`                                         |
| [Go](./go.md)                                       | Custom - Go file                                       | `file://path/to/your/script.go`                                  |
| [Web Browser](./browser.md)                         | Custom - Automate web browser interactions             | `browser`                                                        |
| [Sequence](./sequence.md)                           | Custom - Multi-prompt sequencing                       | `sequence` with config.inputs array                              |
| [Simulated User](./simulated-user.md)               | Custom - Conversation simulator                        | `promptfoo:simulated-user`                                       |
| [WatsonX](./watsonx.md)                             | IBM's WatsonX                                          | `watsonx:ibm/granite-13b-chat-v2`                                |
| [X.AI](./xai.md)                                    | X.AI's models                                          | `xai:grok-3-beta`                                                |

## Provider Syntax

Providers are specified using various syntax options:

1. Simple string format:

   ```yaml
   provider_name:model_name
   ```

   Example: `openai:gpt-4.1` or `anthropic:claude-sonnet-4-20250514`

2. Object format with configuration:

   ```yaml
   - id: provider_name:model_name
     config:
       option1: value1
       option2: value2
   ```

   Example:

   ```yaml
   - id: openai:gpt-4.1
     config:
       temperature: 0.7
       max_tokens: 150
   ```

3. File-based configuration:

   Load a single provider:

   ```yaml title="provider.yaml"
   id: openai:chat:gpt-4.1
   config:
     temperature: 0.7
   ```

   Or multiple providers:

   ```yaml title="providers.yaml"
   - id: openai:gpt-4.1
     config:
       temperature: 0.7
   - id: anthropic:messages:claude-sonnet-4-20250514
     config:
       max_tokens: 1000
   ```

   Reference in your configuration:

   ```yaml title="promptfooconfig.yaml"
   providers:
     - file://provider.yaml # single provider as an object
     - file://providers.yaml # multiple providers as an array
   ```

## Configuring Providers

Most providers use environment variables for authentication:

```sh
export OPENAI_API_KEY=your_api_key_here
export ANTHROPIC_API_KEY=your_api_key_here
```

You can also specify API keys in your configuration file:

```yaml
providers:
  - id: openai:gpt-4.1
    config:
      apiKey: your_api_key_here
```

## Custom Integrations

promptfoo supports several types of custom integrations:

1. File-based providers:

   ```yaml
   providers:
     - file://path/to/provider_config.yaml
   ```

2. JavaScript providers:

   ```yaml
   providers:
     - file://path/to/custom_provider.js
   ```

3. Python providers:

   ```yaml
   providers:
     - id: file://path/to/custom_provider.py
   ```

4. HTTP/HTTPS API:

   ```yaml
   providers:
     - id: https://api.example.com/v1/chat/completions
       config:
         headers:
           Authorization: 'Bearer your_api_key'
   ```

5. WebSocket:

   ```yaml
   providers:
     - id: ws://example.com/ws
       config:
         messageTemplate: '{"prompt": "{{prompt}}"}'
   ```

6. Custom scripts:

   ```yaml
   providers:
     - 'exec: python chain.py'
   ```

## Common Configuration Options

Many providers support these common configuration options:

- `temperature`: Controls randomness (0.0 to 1.0)
- `max_tokens`: Maximum number of tokens to generate
- `top_p`: Nucleus sampling parameter
- `frequency_penalty`: Penalizes frequent tokens
- `presence_penalty`: Penalizes new tokens based on presence in text
- `stop`: Sequences where the API will stop generating further tokens

Example:

```yaml
providers:
  - id: openai:gpt-4.1
    config:
      temperature: 0.7
      max_tokens: 150
      top_p: 0.9
      frequency_penalty: 0.5
      presence_penalty: 0.5
      stop: ["\n", 'Human:', 'AI:']
```

## Model Context Protocol (MCP)

Promptfoo supports the Model Context Protocol (MCP) for enabling advanced tool use and agentic capabilities in LLM providers. MCP allows you to connect providers to external MCP servers to enable tool orchestration, memory, and more.

### Basic MCP Configuration

Enable MCP for a provider by adding the `mcp` block to your provider's configuration:

```yaml
providers:
  - id: openai:gpt-4.1
    config:
      temperature: 0.7
      mcp:
        enabled: true
        server:
          command: npx
          args: ['-y', '@modelcontextprotocol/server-memory']
          name: memory
```

### Multiple MCP Servers

You can connect a single provider to multiple MCP servers:

```yaml
providers:
  - id: openai:gpt-4.1
    config:
      mcp:
        enabled: true
        servers:
          - command: npx
            args: ['-y', '@modelcontextprotocol/server-memory']
            name: server_a
          - url: http://localhost:8001
            name: server_b
```

For detailed MCP documentation and advanced configurations, see the [MCP Integration Guide](../integrations/mcp.md).
