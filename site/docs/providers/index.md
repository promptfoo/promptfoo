---
sidebar_label: LLM Providers
description: Configure multiple LLM providers including Claude Sonnet, GPT-4, and Gemini models with standardized testing interfaces for comprehensive AI evaluation
---

# LLM Providers

Providers in promptfoo are the interfaces to various language models and AI services. This guide will help you understand how to configure and use providers in your promptfoo evaluations.

## Quick Start

Here's a basic example of configuring providers in your promptfoo YAML config:

```yaml
providers:
  - anthropic:messages:claude-sonnet-4-5-20250929
  - openai:gpt-5
  - openai:gpt-5-mini
  - google:gemini-2.5-pro
  - vertex:gemini-2.5-pro
```

## Available Providers

| API Providers                                       | Description                                                  | Syntax & Example                                                                |
| --------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| [OpenAI](./openai.md)                               | GPT models including GPT-5.1 and reasoning models            | `openai:gpt-5.1` or `openai:o4-mini`                                            |
| [Anthropic](./anthropic.md)                         | Claude models                                                | `anthropic:messages:claude-sonnet-4-5-20250929`                                 |
| [Claude Agent SDK](./claude-agent-sdk.md)           | Claude Agent SDK                                             | `anthropic:claude-agent-sdk`                                                    |
| [HTTP](./http.md)                                   | Generic HTTP-based providers                                 | `https://api.example.com/v1/chat/completions`                                   |
| [Javascript](./custom-api.md)                       | Custom - JavaScript file                                     | `file://path/to/custom_provider.js`                                             |
| [Python](./python.md)                               | Custom - Python file                                         | `file://path/to/custom_provider.py`                                             |
| [Ruby](./ruby.md)                                   | Custom - Ruby file                                           | `file://path/to/custom_provider.rb`                                             |
| [Shell Command](./custom-script.md)                 | Custom - script-based providers                              | `exec: python chain.py`                                                         |
| [Claude Agent SDK](./claude-agent-sdk.md)           | Claude Agent SDK                                             | `anthropic:claude-agent-sdk`                                                    |
| [OpenAI ChatKit](./openai-chatkit.md)               | ChatKit workflows from Agent Builder                         | `openai:chatkit:wf_xxxxx`                                                       |
| [OpenAI Codex SDK](./openai-codex-sdk.md)           | OpenAI Codex SDK for code generation and analysis            | `openai:codex-sdk`                                                              |
| [AI21 Labs](./ai21.md)                              | Jurassic and Jamba models                                    | `ai21:jamba-1.5-mini`                                                           |
| [AI/ML API](./aimlapi.md)                           | Tap into 300+ cutting-edge AI models with a single API       | `aimlapi:chat:deepseek-r1`                                                      |
| [Alibaba Cloud (Qwen)](./alibaba.md)                | Alibaba Cloud's Qwen models                                  | `alibaba:qwen-max` or `qwen-plus`                                               |
| [AWS Bedrock](./aws-bedrock.md)                     | AWS-hosted models from various providers                     | `bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0`                          |
| [AWS Bedrock Agents](./bedrock-agents.md)           | Amazon Bedrock Agents for orchestrating AI workflows         | `bedrock-agent:YOUR_AGENT_ID`                                                   |
| [Amazon SageMaker](./sagemaker.md)                  | Models deployed on SageMaker endpoints                       | `sagemaker:my-endpoint-name`                                                    |
| [Azure OpenAI](./azure.md)                          | Azure-hosted OpenAI models                                   | `azureopenai:gpt-4o-custom-deployment-name`                                     |
| [Cerebras](./cerebras.md)                           | High-performance inference API for Llama models              | `cerebras:llama-4-scout-17b-16e-instruct`                                       |
| [Cloudflare AI](./cloudflare-ai.md)                 | Cloudflare's OpenAI-compatible AI platform                   | `cloudflare-ai:@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`                    |
| [Cloudflare AI Gateway](./cloudflare-gateway.md)    | Route requests through Cloudflare AI Gateway                 | `cloudflare-gateway:openai:gpt-5.2`                                             |
| [Cloudera](./cloudera.md)                           | Cloudera AI Inference Service                                | `cloudera:llama-2-13b-chat`                                                     |
| [CometAPI](./cometapi.md)                           | 500+ AI models from multiple providers via unified API       | `cometapi:chat:gpt-5-mini` or `cometapi:image:dall-e-3`                         |
| [Cohere](./cohere.md)                               | Cohere's language models                                     | `cohere:command`                                                                |
| [Databricks](./databricks.md)                       | Databricks Foundation Model APIs                             | `databricks:databricks-meta-llama-3-3-70b-instruct`                             |
| [DeepSeek](./deepseek.md)                           | DeepSeek's language models                                   | `deepseek:deepseek-r1`                                                          |
| [Docker Model Runner](./docker.md)                  | Evaluate with local models                                   | `docker:ai/llama3.2:3B-Q4_K_M`                                                  |
| [Envoy AI Gateway](./envoy.md)                      | OpenAI-compatible AI Gateway proxy                           | `envoy:my-model`                                                                |
| [F5](./f5.md)                                       | OpenAI-compatible AI Gateway interface                       | `f5:path-name`                                                                  |
| [fal.ai](./fal.md)                                  | Image Generation Provider                                    | `fal:image:fal-ai/fast-sdxl`                                                    |
| [Fireworks AI](./fireworks.md)                      | Various hosted models                                        | `fireworks:accounts/fireworks/models/qwen-v2p5-7b`                              |
| [GitHub](./github.md)                               | GitHub Models - OpenAI, Anthropic, Google, and more          | `github:openai/gpt-5` or `github:anthropic/claude-3.7-sonnet`                   |
| [Google AI Studio](./google.md)                     | Gemini models, Live API, and Imagen image generation         | `google:gemini-2.5-pro`, `google:image:imagen-4.0-generate-preview-06-06`       |
| [Google Vertex AI](./vertex.md)                     | Google Cloud's AI platform                                   | `vertex:gemini-2.5-pro`, `vertex:gemini-2.5-flash`                              |
| [Groq](./groq.md)                                   | High-performance inference API                               | `groq:llama-3.3-70b-versatile`                                                  |
| [Helicone AI Gateway](./helicone.md)                | Self-hosted AI gateway for unified provider access           | `helicone:openai/gpt-5`, `helicone:anthropic/claude-sonnet-4`                   |
| [Hyperbolic](./hyperbolic.md)                       | OpenAI-compatible Llama 3 provider                           | `hyperbolic:meta-llama/Llama-3.3-70B-Instruct`                                  |
| [Hugging Face](./huggingface.md)                    | Access thousands of models                                   | `huggingface:text-generation:gpt2`                                              |
| [JFrog ML](./jfrog.md)                              | JFrog's LLM Model Library                                    | `jfrog:llama_3_8b_instruct`                                                     |
| [LiteLLM](./litellm.md)                             | Unified interface for 400+ LLMs with embedding support       | `litellm:gpt-5`, `litellm:embedding:text-embedding-3-small`                     |
| [Llama API](./llamaApi.md)                          | Meta's hosted Llama models with multimodal capabilities      | `llamaapi:Llama-4-Maverick-17B-128E-Instruct-FP8`                               |
| [Mistral AI](./mistral.md)                          | Mistral's language models                                    | `mistral:magistral-medium-latest`                                               |
| [Nscale](./nscale.md)                               | Cost-effective serverless AI inference with zero rate limits | `nscale:openai/gpt-oss-120b`                                                    |
| [OpenLLM](./openllm.md)                             | BentoML's model serving framework                            | Compatible with OpenAI syntax                                                   |
| [OpenRouter](./openrouter.md)                       | Unified API for multiple providers                           | `openrouter:mistral/7b-instruct`                                                |
| [Perplexity AI](./perplexity.md)                    | Search-augmented chat with citations                         | `perplexity:sonar-pro`                                                          |
| [QuiverAI](./quiverai.md)                           | Chat completions optimized for SVG vector graphics           | `quiverai:arrow-0.5` or `quiverai:chat:arrow-0.5`                               |
| [Replicate](./replicate.md)                         | Various hosted models                                        | `replicate:stability-ai/sdxl`                                                   |
| [Slack](./slack.md)                                 | Human feedback via Slack channels/DMs                        | `slack:C0123ABCDEF` or `slack:channel:C0123ABCDEF`                              |
| [Snowflake Cortex](./snowflake.md)                  | Snowflake's AI platform with Claude, GPT, and Llama models   | `snowflake:mistral-large2`                                                      |
| [Together AI](./togetherai.md)                      | Various hosted models                                        | Compatible with OpenAI syntax                                                   |
| [TrueFoundry](./truefoundry.md)                     | Unified LLM Gateway for 1000+ models                         | `truefoundry:openai-main/gpt-5`, `truefoundry:anthropic-main/claude-sonnet-4.5` |
| [Vercel AI Gateway](./vercel.md)                    | Unified AI Gateway with 0% markup and built-in failover      | `vercel:openai/gpt-4o-mini`, `vercel:anthropic/claude-sonnet-4.5`               |
| [Voyage AI](./voyage.md)                            | Specialized embedding models                                 | `voyage:voyage-3`                                                               |
| [vLLM](./vllm.md)                                   | Local                                                        | Compatible with OpenAI syntax                                                   |
| [Ollama](./ollama.md)                               | Local                                                        | `ollama:chat:llama3.3`                                                          |
| [LocalAI](./localai.md)                             | Local                                                        | `localai:gpt4all-j`                                                             |
| [Llamafile](./llamafile.md)                         | OpenAI-compatible llamafile server                           | Uses OpenAI provider with custom endpoint                                       |
| [llama.cpp](./llama.cpp.md)                         | Local                                                        | `llama:7b`                                                                      |
| [Transformers.js](./transformers.md)                | Local ONNX inference via Transformers.js                     | `transformers:text-generation:Xenova/gpt2`                                      |
| [MCP (Model Context Protocol)](./mcp.md)            | Direct MCP server integration for testing agentic systems    | `mcp` with server configuration                                                 |
| [Text Generation WebUI](./text-generation-webui.md) | Gradio WebUI                                                 | Compatible with OpenAI syntax                                                   |
| [WebSocket](./websocket.md)                         | WebSocket-based providers                                    | `ws://example.com/ws`                                                           |
| [Webhook](./webhook.md)                             | Custom - Webhook integration                                 | `webhook:http://example.com/webhook`                                            |
| [Echo](./echo.md)                                   | Custom - For testing purposes                                | `echo`                                                                          |
| [Manual Input](./manual-input.md)                   | Custom - CLI manual entry                                    | `promptfoo:manual-input`                                                        |
| [Go](./go.md)                                       | Custom - Go file                                             | `file://path/to/your/script.go`                                                 |
| [Web Browser](./browser.md)                         | Custom - Automate web browser interactions                   | `browser`                                                                       |
| [Sequence](./sequence.md)                           | Custom - Multi-prompt sequencing                             | `sequence` with config.inputs array                                             |
| [Simulated User](./simulated-user.md)               | Custom - Conversation simulator                              | `promptfoo:simulated-user`                                                      |
| [WatsonX](./watsonx.md)                             | IBM's WatsonX                                                | `watsonx:ibm/granite-3-3-8b-instruct`                                           |
| [X.AI](./xai.md)                                    | X.AI's models (text, image, video, voice)                    | `xai:grok-3-beta`, `xai:video:grok-imagine-video`                               |

## Provider Syntax

Providers are specified using various syntax options:

1. Simple string format:

   ```yaml
   provider_name:model_name
   ```

   Example: `openai:gpt-5` or `anthropic:claude-sonnet-4-5-20250929`

2. Object format with configuration:

   ```yaml
   - id: provider_name:model_name
     config:
       option1: value1
       option2: value2
   ```

   Example:

   ```yaml
   - id: openai:gpt-5
     config:
       temperature: 0.7
       max_tokens: 150
   ```

3. File-based configuration:

   Load a single provider:

   ```yaml title="provider.yaml"
   id: openai:chat:gpt-5
   config:
     temperature: 0.7
   ```

   Or multiple providers:

   ```yaml title="providers.yaml"
   - id: openai:gpt-5
     config:
       temperature: 0.7
   - id: anthropic:messages:claude-sonnet-4-5-20250929
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
  - id: openai:gpt-5
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
  - id: openai:gpt-5
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
  - id: openai:gpt-5
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
  - id: openai:gpt-5
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

## Advanced Usage

### Linking Custom Providers to Cloud Targets (Promptfoo Cloud)

:::info Promptfoo Cloud Feature
This feature is available in [Promptfoo Cloud](/docs/enterprise) deployments.
:::

Link custom providers ([Python](/docs/providers/python/), [JavaScript](/docs/providers/custom-api/), [HTTP](/docs/providers/http/)) to cloud targets using `linkedTargetId`. This consolidates findings from multiple eval runs into one dashboard, allowing you to track performance over time and view comprehensive reporting.

```yaml
providers:
  - id: 'file://my_provider.py'
    config:
      linkedTargetId: 'promptfoo://provider/12345678-1234-1234-1234-123456789abc'
```

See [Linking Local Targets to Cloud](/docs/red-team/troubleshooting/linking-targets/) for setup instructions.

### Using Cloud Targets with Local Config Overrides

:::info Promptfoo Cloud Feature

This feature is available in [Promptfoo Cloud](/docs/enterprise) deployments.

:::

Cloud targets store provider configurations (API keys, base settings) in Promptfoo Cloud. Reference them using the `promptfoo://provider/` protocol and optionally override specific config values locally.

**Basic usage:**

```yaml
providers:
  - promptfoo://provider/12345-abcd-uuid
```

**Override cloud config locally:**

```yaml
providers:
  - id: promptfoo://provider/12345-abcd-uuid
    config:
      temperature: 0.9 # Override cloud temperature
      max_tokens: 2000 # Override cloud max_tokens
    label: 'Custom Label' # Override display name
```

Local config takes precedence, allowing you to:

- Store API keys centrally in the cloud
- Override model parameters per eval (temperature, max_tokens, etc.)
- Test different configurations without modifying the cloud target
- Customize labels and other metadata locally

All fields from the cloud provider are preserved unless explicitly overridden.
