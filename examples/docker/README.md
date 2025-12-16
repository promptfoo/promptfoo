# Docker Comparison

[Docker Model Runner](https://docs.docker.com/ai/model-runner/) makes it easy to manage, run, and deploy AI models using Docker. Designed for developers, Docker Model Runner streamlines the process of pulling, running, and serving large language models (LLMs) and other AI models directly from Docker Hub or any OCI-compliant registry.

## Getting Started

1. Create a promptfoo project with docker examples

```bash
npx promptfoo@latest init --example docker
cd docker
```

2. Enable Docker Model Runner in Docker Desktop or Docker Engine per https://docs.docker.com/ai/model-runner/#enable-docker-model-runner.
3. Use the Docker Model Runner CLI to pull the models

**For the simple example:**

```bash
docker model pull ai/llama3.2:3B-Q4_K_M
```

**For the advanced example:**

```bash
docker model pull ai/llama3.2:3B-Q4_K_M
docker model pull ai/gemma3:4B-Q4_K_M
docker model pull ai/phi4:14B-Q4_K_M
docker model pull ai/deepseek-r1-distill-llama:8B-Q4_K_M
docker model pull ai/smollm3:Q4_K_M
docker model pull ai/mxbai-embed-large:335M-F16
```

Note: These six models together require ~20 GiB of disk storage.

## Simple Example

```bash
promptfoo eval -c promptfooconfig.comparison.simple.yaml
```

## Advanced Example

```bash
promptfoo eval -c promptfooconfig.comparison.advanced.yaml
```
