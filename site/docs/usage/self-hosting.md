---
sidebar_position: 50
description: Learn how to self-host promptfoo using Docker. This comprehensive guide walks you through setup, configuration, and troubleshooting for your own instance.
keywords:
  - AI testing
  - configuration
  - Docker
  - LLM eval
  - LLM evaluation
  - promptfoo
  - self-hosting
  - setup guide
  - team collaboration
---

# Self-hosting

promptfoo provides a Docker image that allows you to host a central server that stores your team's evals. With this, you can:

- Share your evals with your team.
- Run evals in your CI/CD pipeline and aggregate the results.
- Keep sensitive data off of your local machine.

The self-hosted app consists of:

- Next.js application that runs the web ui.
- filesystem store that persists the eval results.
- key-value (KV) store that persists shared data (redis, filesystem, or memory).

## Setup

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

`NEXT_PUBLIC_PROMPTFOO_BASE_URL` tells the web app where to send the API request when the user clicks the 'Share' button. This should be configured to match the URL of your self-hosted instance.

Replace `http://localhost:3000` with your instance's URL if you're not running it locally.

### 3. Run the Docker Container

Launch the Docker container using this command:

```sh
docker run -d --name promptfoo_container -p 3000:3000 -v /path/to/local_promptfoo:/root/.promptfoo promptfoo-ui
```

Key points:

- `-v /path/to/local_promptfoo:/root/.promptfoo` maps the container's working directory to your local filesystem. Replace `/path/to/local_promptfoo` with your preferred path.
- Omitting the `-v` argument will result in non-persistent evals.

### 4. Set API Credentials

You can also set API credentials on the running Docker instance so that evals can be run on the server. For example, we'll set the OpenAI API key so users can run evals directly from the web ui:

```sh
docker run -d --name promptfoo_container -p 3000:3000 -e OPENAI_API_KEY=sk-abc123 promptfoo-ui
```

Replace `sk-abc123` with your actual API key.

## Advanced Configuration

### Eval Storage

promptfoo uses a SQLite database (`promptfoo.db`) located in `/root/.promptfoo` on the image. Ensure this directory is persisted to save your evals.

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

## Pointing the promptfoo client to your hosted instance

When self-hosting, you need to set the environment variables so that the `promptfoo share` command knows how to reach your hosted application. Here's an example:

```sh
PROMPTFOO_REMOTE_API_BASE_URL=http://localhost:3000 PROMPTFOO_REMOTE_APP_BASE_URL=http://localhost:3000 promptfoo share -y
```

This will create a shareable URL using your self-hosted service.

The `PROMPTFOO_REMOTE_API_BASE_URL` environment variable specifies the base URL for the API endpoints of your self-hosted service. This is where the `promptfoo share` command sends data to create a shareable URL.

Similarly, the `PROMPTFOO_REMOTE_APP_BASE_URL` environment variable sets the base URL for the UI of your self-hosted service. This will be a visible part of the shareable URL.

These configuration options can also be set under the `sharing` property of your promptfoo config:

```yaml
sharing:
  apiBaseUrl: http://localhost:3000
  appBaseUrl: http://localhost:3000
```
