---
title: Docker Model Runner
sidebar_label: Docker Model Runner
description: Run and evaluate AI models locally with Docker Model Runner for containerized testing, deployment, and benchmarking
---

# Docker Model Runner

[Docker Model Runner](https://docs.docker.com/ai/model-runner/) makes it easy to manage, run, and deploy AI models using Docker. Designed for developers, Docker Model Runner streamlines the process of pulling, running, and serving large language models (LLMs) and other AI models directly from Docker Hub or any OCI-compliant registry.

## Quick Start

1. Enable Docker Model Runner in Docker Desktop or Docker Engine per https://docs.docker.com/ai/model-runner/#enable-docker-model-runner.
2. Use the Docker Model Runner CLI to pull `ai/llama3.2:3B-Q4_K_M`

```bash
docker model pull ai/llama3.2:3B-Q4_K_M
```

3. Test your setup with working examples:

```bash
npx promptfoo@latest eval -c https://raw.githubusercontent.com/promptfoo/promptfoo/main/examples/docker/promptfooconfig.comparison.simple.yaml
```

For an eval comparing several models with `llm-rubric` and `similar` assertions , see https://raw.githubusercontent.com/promptfoo/promptfoo/main/examples/docker/promptfooconfig.comparison.advanced.yaml.

## Models

```
docker:chat:<model_name>
docker:completion:<model_name>
docker:embeddings:<model_name>
docker:embedding:<model_name>  # Alias for embeddings
docker:<model_name>            # Defaults to chat
```

Note: Both `docker:embedding:` and `docker:embeddings:` prefixes are supported for embedding models and will work identically.

For a list of curated models on Docker Hub, visit the [Docker Hub Models page](https://hub.docker.com/u/ai).

### Hugging Face Models

Docker Model Runner can pull supported models from Hugging Face (i.e. models in GGUF format). For a complete list of all supported models on Hugging Face, visit this [HF search page](https://huggingface.co/models?apps=docker-model-runner&sort=trending).

```
docker:chat:hf.co/<model_name>
docker:completion:hf.co/<model_name>
docker:embeddings:hf.co/<model_name>
docker:embedding:hf.co/<model_name>  # Alias for embeddings
docker:hf.co/<model_name>             # Defaults to chat
```

## Configuration

Configure the provider in your promptfoo configuration file:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: docker:ai/smollm3:Q4_K_M
    config:
      temperature: 0.7
```

### Configuration Options

Supported environment variables:

- `DOCKER_MODEL_RUNNER_BASE_URL` - (optional) protocol, host name, and port. Defaults to `http://localhost:12434`. Set to `http://model-runner.docker.internal` when running within a container.
- `DOCKER_MODEL_RUNNER_API_KEY` - (optional) api key that is passed as the Bearer token in the Authorization Header when calling the API. Defaults to `dmr` to satisfy OpenAI API validation (not used by Docker Model Runner).

Standard OpenAI parameters are supported:

| Parameter           | Description                                  |
| ------------------- | -------------------------------------------- |
| `temperature`       | Controls randomness (0.0 to 2.0)             |
| `max_tokens`        | Maximum number of tokens to generate         |
| `top_p`             | Nucleus sampling parameter                   |
| `frequency_penalty` | Penalizes frequent tokens                    |
| `presence_penalty`  | Penalizes new tokens based on presence       |
| `stop`              | Sequences where the API will stop generating |
| `stream`            | Enable streaming responses                   |

## Notes

- To conserve system resources, consider running evaluations serially with `promptfoo eval -j 1`.
