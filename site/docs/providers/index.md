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
  - google:gemini-2.5-pro
  - vertex:gemini-2.5-pro
```

## Available Providers

| API Providers                                                 | Description                                               | Syntax & Example                                             |
| ------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------ |
| [OpenAI](./openai.md)                                         | GPT models including GPT-4.1 and reasoning models         | `openai:gpt-4.1` or `openai:o4-mini`                         |
| [Anthropic](./anthropic.md)                                   | Claude models                                             | `anthropic:messages:claude-sonnet-4-20250514`                |
| [HTTP](./http.md)                                             | Generic HTTP-based providers                              | `https://api.example.com/v1/chat/completions`                |
| [Javascript](./custom-api.md)                                 | Custom - JavaScript file                                  | `file://path/to/custom_provider.js`                          |
| [Python](./python.md)                                         | Custom - Python file                                      | `file://path/to/custom_provider.py`                          |
| [Shell Command](./custom-script.md)                           | Custom - script-based providers                           | `exec: python chain.py`                                      |
| [AI21 Labs](./ai21.md)                                        | Jurassic and Jamba models                                 | `ai21:jamba-1.5-mini`                                        |
| [AI/ML API](./aimlapi.md)                                     | Tap into 300+ cutting-edge AI models with a single API    | `aimlapi:chat:deepseek-r1`                                   |
| [AWS Bedrock](./aws-bedrock.md)                               | AWS-hosted models from various providers                  | `bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0`         |
| [Amazon SageMaker](./sagemaker.md)                            | Models deployed on SageMaker endpoints                    | `sagemaker:my-endpoint-name`                                 |
| [Azure OpenAI](./azure.md)                                    | Azure-hosted OpenAI models                                | `azureopenai:gpt-4o-custom-deployment-name`                  |
| [Cerebras](./cerebras.md)                                     | High-performance inference API for Llama models           | `cerebras:llama-4-scout-17b-16e-instruct`                    |
| [Adaline Gateway](./adaline.md)                               | Unified interface for multiple providers                  | Compatible with OpenAI syntax                                |
| [Cloudflare AI](./cloudflare-ai.md)                           | Cloudflare's OpenAI-compatible AI platform                | `cloudflare-ai:@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` |
| [Cloudera](./cloudera.md)                                     | Cloudera AI Inference Service                             | `cloudera:llama-2-13b-chat`                                  |
| [Cohere](./cohere.md)                                         | Cohere's language models                                  | `cohere:command`                                             |
| [Databricks](./databricks.md)                                 | Databricks Foundation Model APIs                          | `databricks:databricks-meta-llama-3-3-70b-instruct`          |
| [DeepSeek](./deepseek.md)                                     | DeepSeek's language models                                | `deepseek:deepseek-r1`                                       |
| [F5](./f5.md)                                                 | OpenAI-compatible AI Gateway interface                    | `f5:path-name`                                               |
| [FAL](./fal.md)                                               | Platform for running AI models                            | `fal:qwen/qwen-2-5-vl-72b-instruct`                          |
| [Fireworks AI](./fireworks.md)                                | Optimized inference for open-source models                | `fireworks:llama-v3p3-70b-instruct`                          |
| [Google AI Studio](./google.md)                               | Google's Gemini models                                    | `google:gemini-2.5-pro`                                      |
| [Google Vertex](./vertex.md)                                  | Google Cloud's AI platform                                | `vertex:gemini-2.5-pro`                                      |
| [Groq](./groq.md)                                             | High-performance LLM inference                            | `groq:llama-70b`                                             |
| [Helicone](./helicone.md)                                     | Observability platform with caching and custom properties | `helicone:openai:gpt-4o`                                     |
| [HuggingFace (Local Inference)](./huggingface.md)             | Local inference with transformers library                 | `huggingface:text:microsoft/Phi-4`                           |
| [HuggingFace Endpoints](./huggingface.md)                     | Serverless HuggingFace endpoints                          | `huggingface:endpoint:your-endpoint-id`                      |
| [HuggingFace Text Generation](./huggingface.md) | HuggingFace text generation inference server              | `huggingface:text-generation:llama-7b`                       |
| [Hyperbolic](./hyperbolic.md)                                 | High-efficiency AI inference cloud                        | `hyperbolic:deepseek-r1-distill-llama-70b`                   |
| [IBM BAM](./ibm-bam.md)                                           | IBM BAM service (Experimental)                            | `bam:chat:granite-guardian-3-8b`                             |
| [LambdaLabs](./lambdalabs.md)                                 | Cloud compute for AI workloads                            | `lambdalabs:hermes-3-llama-3.1-70b-fp8`                      |

| [LiteLLM](./litellm.md)                                       | Unified API proxy for 150+ LLM providers                  | `litellm:gpt-4o`                                             |
| [Llama.cpp](./llama.cpp.md)                                    | Run LLMs locally with C++ implementation                  | `llama:llama-3-8b`                                           |

| [LocalAI](./localai.md)                                       | Self-hosted OpenAI alternative                            | `localai:phi-2`                                              |
| [Mistral AI](./mistral.md)                                    | Mistral's language models                                 | `mistral:mistral-large-latest`                               |

| [Ollama](./ollama.md)                                         | Run LLMs locally                                          | `ollama:chat:llama4.1`                                       |

| [OpenLLM](./openllm.md)                                       | Run any open-source LLMs as OpenAI-compatible APIs        | `http://localhost:3000/v1/chat/completions`                  |
| [OpenRouter](./openrouter.md)                                 | Access multiple model providers with one API              | `openrouter:google/gemini-2.0-pro:beta`                      |
| [Perplexity](./perplexity.md)                                 | Language models with web search                           | `perplexity:sonar-reasoning`                                 |

| [Replicate](./replicate.md)                                   | Run ML models in the cloud                                | `replicate:meta/llama-3.3-70b-instruct`                      |

| [Together AI](./togetherai.md)                                  | Scalable inference for open-source models                 | `together:meta-llama/Meta-Llama-3.3-70B-Instruct`            |
| [vLLM](./vllm.md)                                             | High-throughput LLM serving                               | `vllm:llama-8b`                                              |
| [Voyage AI](./voyage.md)                                      | Specialized embeddings and reranking models               | `voyage:voyage-3-lite`                                       |
| [WebsocketGenerativeAI](./websocket.md)                       | Real-time streaming inference                             | `websocket:ws://localhost:8080`                              |
| [Echo](./echo.md)                                             | Custom - For testing purposes                             | `echo`                                                       |
| [Manual Input](./manual-input.md)                             | Custom - CLI manual entry                                 | `promptfoo:manual-input`                                     |
| [Go](./go.md)                                                 | Custom - Go file                                          | `file://path/to/your/script.go`                              |
| [Web Browser](./browser.md)                                   | Custom - Automate web browser interactions                | `browser`                                                    |
| [Sequence](./sequence.md)                                     | Custom - Multi-prompt sequencing                          | `sequence` with config.inputs array                          |
| [Simulated User](./simulated-user.md)                         | Custom - Conversation simulator                           | `promptfoo:simulated-user`                                   |
| [Variable Optimizer](./variable-optimizer.md)                 | Custom - Automated prompt variable optimization           | `promptfoo:variable-optimizer`                               |
| [WatsonX](./watsonx.md)                                       | IBM's WatsonX                                             | `watsonx:ibm/granite-13b-chat-v2`                            |
| [X.AI](./xai.md)                                              | X.AI's models                                             | `xai:grok-3-beta`                                            |

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
