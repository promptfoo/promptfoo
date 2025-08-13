---
sidebar_position: 1
sidebar_label: Introduction
---

# Providers

promptfoo supports evaluating LLM prompt and model quality from various providers.

## Quick Start

Specify one or more providers in your configuration:

```yaml
providers:
  - openai:gpt-4.1
  - openai:o4-mini
  - google:gemini-2.5-pro
  - vertex:gemini-2.5-pro
```

## Available Providers

| API Providers                                       | Description                                               | Syntax & Example                                                          |
| --------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| [OpenAI](./openai.md)                               | GPT models including GPT-4.1 and reasoning models         | `openai:gpt-4.1` or `openai:o4-mini`                                      |
| [Anthropic](./anthropic.md)                         | Claude models                                             | `anthropic:messages:claude-sonnet-4-20250514`                             |
| [HTTP](./http.md)                                   | Generic HTTP-based providers                              | `https://api.example.com/v1/chat/completions`                             |
| [Javascript](./custom-api.md)                       | Custom - JavaScript file                                  | `file://path/to/custom_provider.js`                                       |
| [Python](./python.md)                               | Custom - Python file                                      | `file://path/to/custom_provider.py`                                       |
| [Shell Command](./custom-script.md)                 | Custom - script-based providers                           | `exec: python chain.py`                                                   |
| [AI21 Labs](./ai21.md)                              | Jurassic and Jamba models                                 | `ai21:jamba-1.5-mini`                                                     |
| [AI/ML API](./aimlapi.md)                           | Tap into 300+ cutting-edge AI models with a single API    | `aimlapi:chat:deepseek-r1`                                                |
| [AWS Bedrock](./aws-bedrock.md)                     | AWS-hosted models from various providers                  | `bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0`                      |
| [Amazon SageMaker](./sagemaker.md)                  | Models deployed on SageMaker endpoints                    | `sagemaker:my-endpoint-name`                                              |
| [Azure OpenAI](./azure.md)                          | Azure-hosted OpenAI models                                | `azureopenai:gpt-4o-custom-deployment-name`                               |
| [Cerebras](./cerebras.md)                           | High-performance inference API for Llama models           | `cerebras:llama-4-scout-17b-16e-instruct`                                 |
| [Adaline Gateway](./adaline.md)                     | Unified interface for multiple providers                  | Compatible with OpenAI syntax                                             |
| [Cloudflare AI](./cloudflare-ai.md)                 | Cloudflare's OpenAI-compatible AI platform                | `cloudflare-ai:@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`              |
| [Cloudera](./cloudera.md)                           | Cloudera AI Inference Service                             | `cloudera:llama-2-13b-chat`                                               |
| [Cohere](./cohere.md)                               | Cohere's language models                                  | `cohere:command`                                                          |
| [Databricks](./databricks.md)                       | Databricks Foundation Model APIs                          | `databricks:databricks-meta-llama-3-3-70b-instruct`                       |
| [DeepSeek](./deepseek.md)                           | DeepSeek's language models                                | `deepseek:deepseek-r1`                                                    |
| [Docker Model Runner](./docker.md)                  | Evaluate with local models                                | `docker:ai/llama3.2:3B-Q4_K_M`                                            |
| [F5](./f5.md)                                       | OpenAI-compatible AI Gateway interface                    | `f5:path-name`                                                            |
| [fal.ai](./fal.md)                                  | Image Generation Provider                                 | `fal:image:fal-ai/fast-sdxl`                                              |
| [Fireworks AI](./fireworks.md)                      | Various hosted models                                     | `fireworks:accounts/fireworks/models/qwen-v2p5-7b`                        |
| [GitHub](./github.md)                               | GitHub Models - OpenAI, Anthropic, Google, and more       | `github:openai/gpt-4.1` or `github:anthropic/claude-3.7-sonnet`           |
| [Google AI Studio](./google.md)                     | Gemini models, Live API, and Imagen image generation      | `google:gemini-2.5-pro`, `google:image:imagen-4.0-generate-preview-06-06` |
| [Google Vertex AI](./vertex.md)                     | Google Cloud's AI platform                                | `vertex:gemini-2.5-pro`, `vertex:gemini-2.5-flash`                        |
| [Groq](./groq.md)                                   | High-performance inference API                            | `groq:llama-3.3-70b-versatile`                                            |
| [Helicone AI Gateway](./helicone.md)                | Self-hosted AI gateway for unified provider access        | `helicone:openai/gpt-4.1`, `helicone:anthropic/claude-sonnet-4`           |
| [Hyperbolic](./hyperbolic.md)                       | OpenAI-compatible Llama 3 provider                        | `hyperbolic:meta-llama/Llama-3.3-70B-Instruct`                            |
| [Hugging Face](./huggingface.md)                    | Access thousands of models                                | `huggingface:text-generation:gpt2`                                        |
| [IBM BAM](./ibm-bam.md)                             | IBM's foundation models                                   | `bam:chat:ibm/granite-13b-chat-v2`                                        |
| [JFrog ML](./jfrog.md)                              | JFrog's LLM Model Library                                 | `jfrog:llama_3_8b_instruct`                                               |
| [Lambda Labs](./lambdalabs.md)                      | Access Lambda Labs models via their Inference API         | `lambdalabs:model-name`                                                   |
| [LiteLLM](./litellm.md)                             | Unified interface for 400+ LLMs with embedding support    | `litellm:gpt-4.1`, `litellm:embedding:text-embedding-3-small`             |
| [Mistral AI](./mistral.md)                          | Mistral's language models                                 | `mistral:magistral-medium-latest`                                         |
| [OpenLLM](./openllm.md)                             | BentoML's model serving framework                         | Compatible with OpenAI syntax                                             |
| [OpenRouter](./openrouter.md)                       | Unified API for multiple providers                        | `openrouter:mistral/7b-instruct`                                          |
| [Perplexity AI](./perplexity.md)                    | Search-augmented chat with citations                      | `perplexity:sonar-pro`                                                    |
| [Replicate](./replicate.md)                         | Various hosted models                                     | `replicate:stability-ai/sdxl`                                             |
| [Slack](./slack.md)                                 | Human feedback via Slack channels/DMs                     | `slack:C0123ABCDEF` or `slack:channel:C0123ABCDEF`                        |
| [Together AI](./togetherai.md)                      | Various hosted models                                     | Compatible with OpenAI syntax                                             |
| [Voyage AI](./voyage.md)                            | Specialized embedding models                              | `voyage:voyage-3`                                                         |
| [vLLM](./vllm.md)                                   | Local                                                     | Compatible with OpenAI syntax                                             |
| [Ollama](./ollama.md)                               | Local                                                     | `ollama:chat:llama3.3`                                                    |
| [LocalAI](./localai.md)                             | Local                                                     | `localai:gpt4all-j`                                                       |
| [Llamafile](./llamafile.md)                         | OpenAI-compatible llamafile server                        | Uses OpenAI provider with custom endpoint                                 |
| [llama.cpp](./llama.cpp.md)                         | Local                                                     | `llama:7b`                                                                |
| [MCP (Model Context Protocol)](./mcp.md)            | Direct MCP server integration for testing agentic systems | `mcp` with server configuration                                           |
| [Text Generation WebUI](./text-generation-webui.md) | Gradio WebUI                                              | Compatible with OpenAI syntax                                             |
| [WebSocket](./websocket.md)                         | WebSocket-based providers                                 | `ws://example.com/ws`                                                     |
| [Webhook](./webhook.md)                             | Custom - Webhook integration                              | `webhook:http://example.com/webhook`                                      |
| [Echo](./echo.md)                                   | Custom - For testing purposes                             | `echo`                                                                    |
| [Manual Input](./manual-input.md)                   | Custom - CLI manual entry                                 | `promptfoo:manual-input`                                                  |
| [Go](./go.md)                                       | Custom - Go file                                          | `file://path/to/your/script.go`                                           |
| [Web Browser](./browser.md)                         | Custom - Automate web browser interactions                | `browser`                                                                 |
| [Sequence](./sequence.md)                           | Custom - Multi-prompt sequencing                          | `sequence` with config.inputs array                                       |
| [Simulated User](./simulated-user.md)               | Custom - Conversation simulator                           | `promptfoo:simulated-user`                                                |
| [WatsonX](./watsonx.md)                             | IBM's WatsonX                                             | `watsonx:ibm/granite-13b-chat-v2`                                         |
| [X.AI](./xai.md)                                    | X.AI's models                                             | `xai:grok-3-beta`                                                         |

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
   - id: openai:gpt-4o
     config:
       temperature: 0
       max_tokens: 1024
   ```

3. External configuration files (YAML/JSON):

   ```yaml
   - file://path/to/provider-config.yaml
   ```

## Best Practices

- **Test against multiple models**: Compare outputs across different providers to ensure robustness
- **Use appropriate models for tasks**: Choose specialized models (e.g., code models for programming tasks)
- **Configure parameters carefully**: Adjust temperature, max_tokens, and other parameters based on your use case
- **Consider costs**: Balance model capability with API costs for large-scale evaluations

## Next Steps

- Choose a [provider](./index.md) that fits your needs
- Learn about [configuration options](/docs/configuration/guide)
- Set up [test cases](/docs/configuration/guide/#test-cases) for evaluation
- Run your first [evaluation](/docs/getting-started)
