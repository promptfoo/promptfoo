---
sidebar_position: 50
title: Self-hosting Guide for promptfoo
description: Learn how to self-host promptfoo using Docker. This comprehensive guide walks you through setup, configuration, and troubleshooting for your own instance.
keywords:
  - promptfoo
  - self-hosting
  - Docker
  - setup guide
  - configuration
  - LLM evaluation
  - AI testing
  - team collaboration
---

# Self-hosting

promptfoo provides a Docker image that allows you to host a central server that stores your team's evals.

The self-hosted app consists of:

- Next.js application that runs the web ui.
- filesystem store that persists the eval results.
- key-value (KV) store that persists shared data (redis, filesystem, or memory).

## Why Self-host promptfoo?

Self-hosting promptfoo offers several advantages:

- Complete control over your data and evaluations
- Enhanced security for sensitive prompts and results
- Customizable setup to fit your organization's needs
- Seamless integration with your existing infrastructure

## Prerequisites

Before diving in, ensure you have:

- Docker installed on your system
- Basic familiarity with Docker commands
- A machine with at least 2GB of RAM and 10GB of available storage
- Administrator access to your system

## Step-by-Step Setup Process

### 1. Clone the Repository

First, clone the promptfoo repository from GitHub:

```sh
git clone https://github.com/promptfoo/promptfoo.git
cd promptfoo
```

### 2. Build the Docker Image

Build the Docker image with the following command:

```sh
docker build --build-arg NEXT_PUBLIC_PROMPTFOO_BASE_URL=http://localhost:3000 -t promptfoo-ui .
```

Replace `http://localhost:3000` with your instance's URL if you're not running it locally.

### 3. Run the Docker Container

Launch the Docker container using this command:

```sh
docker run -d --name promptfoo_container -p 3000:3000 -v /path/to/local_promptfoo:/root/.promptfoo promptfoo-ui
```

Key points:

- `-v /path/to/local_promptfoo:/root/.promptfoo` maps the container's working directory to your local filesystem. Replace `/path/to/local_promptfoo` with your preferred path.
- Omitting the `-v` argument will result in non-persistent evaluations.

### 4. Set API Credentials

To enable server-side evaluations, set your API credentials. For example, to set the OpenAI API key:

```sh
docker run -d --name promptfoo_container -p 3000:3000 -e OPENAI_API_KEY=sk-abc123 promptfoo-ui
```

Replace `sk-abc123` with your actual API key.

## Advanced Configuration

### Eval Storage

promptfoo uses a SQLite database (`promptfoo.db`) located in `/root/.promptfoo` on the image. Ensure this directory is persisted to save your evaluations.

### Configuring the KV Store

By default, promptfoo uses an in-memory store for shared results. You can configure it to use Redis or the filesystem by setting these environment variables:

| Environment Variable             | Description                                                    | Default Value       |
| -------------------------------- | -------------------------------------------------------------- | ------------------- |
| `PROMPTFOO_SHARE_STORE_TYPE`     | The type of store to use (`memory`, `redis`, or `filesystem`). | `memory`            |
| `PROMPTFOO_SHARE_TTL`            | The time-to-live (TTL) for shared URLs in seconds.             | `1209600` (2 weeks) |
| `PROMPTFOO_SHARE_REDIS_HOST`     | The Redis host.                                                | -                   |
| `PROMPTFOO_SHARE_REDIS_PORT`     | The Redis port.                                                | -                   |
| `PROMPTFOO_SHARE_REDIS_PASSWORD` | The Redis password.                                            | -                   |
| `PROMPTFOO_SHARE_REDIS_DB`       | The Redis database number.                                     | `0`                 |
| `PROMPTFOO_SHARE_STORE_PATH`     | The filesystem path for storing shared results.                | `share-store`       |

#### Redis Configuration Example

To use Redis for the KV store:

```sh
docker run -d --name promptfoo_container -p 3000:3000 \
  -v /path/to/local_promptfoo:/root/.promptfoo \
  -e PROMPTFOO_SHARE_STORE_TYPE=redis \
  -e PROMPTFOO_SHARE_REDIS_HOST=redis_host \
  -e PROMPTFOO_SHARE_REDIS_PORT=6379 \
  -e PROMPTFOO_SHARE_REDIS_PASSWORD=your_password \
  promptfoo-ui
```

## Connecting promptfoo Client to Your Instance

To use the `promptfoo share` command with your self-hosted instance, set these environment variables:

```sh
PROMPTFOO_REMOTE_API_BASE_URL=http://localhost:3000 PROMPTFOO_REMOTE_APP_BASE_URL=http://localhost:3000 promptfoo share -y
```

These configuration options can also be set under the `sharing` property of your promptfoo config:

```yaml
sharing:
  apiBaseUrl: http://localhost:3000
  appBaseUrl: http://localhost:3000
```
