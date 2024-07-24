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

- Next.js application that runs the web UI.
- Filesystem store that persists the eval results.
- Key-value (KV) store that persists shared data (redis, filesystem, or memory).

## Using the pre-built Docker image

promptfoo is available as a Docker image published on GitHub Container Registry. This is the easiest way to get started with self-hosting.

### 1. Pull the Docker image

Pull the latest version of the promptfoo image:

```bash
docker pull ghcr.io/promptfoo/promptfoo:main
```

For a specific version, use a tag:

```bash
docker pull ghcr.io/promptfoo/promptfoo:v0.x.x
```

### 2. Run the Docker container

Launch the Docker container using this command:

```bash
docker run -d --name promptfoo_container -p 3000:3000 -v /path/to/local_promptfoo:/root/.promptfoo ghcr.io/promptfoo/promptfoo:main
```

Key points:

- `-v /path/to/local_promptfoo:/root/.promptfoo` maps the container's working directory to your local filesystem. Replace `/path/to/local_promptfoo` with your preferred path.
- Omitting the `-v` argument will result in non-persistent evals.

### 3. Set API Credentials (Optional)

To run evals on the server, set API credentials:

```bash
docker run -d --name promptfoo_container -p 3000:3000 -e OPENAI_API_KEY=sk-abc123 ghcr.io/promptfoo/promptfoo:main
```

Replace `sk-abc123` with your actual API key.

## Building your own Docker image

If you need to customize the image, you can build it yourself.

### 1. Clone the Repository

```sh
git clone https://github.com/promptfoo/promptfoo.git
cd promptfoo
```

### 2. Build the Docker Image

```sh
docker build --build-arg NEXT_PUBLIC_PROMPTFOO_BASE_URL=http://localhost:3000 -t promptfoo-ui .
```

Replace `http://localhost:3000` with your instance's URL if you're not running it locally.

### 3. Run the Docker Container

Follow the same steps as in the pre-built image section, but use your custom image name (`promptfoo-ui`) instead of `ghcr.io/promptfoo/promptfoo:main`.

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
  ghcr.io/promptfoo/promptfoo:main
```

## Pointing the promptfoo client to your hosted instance

When self-hosting, set the environment variables so that the `promptfoo share` command knows how to reach your hosted application:

```sh
PROMPTFOO_REMOTE_API_BASE_URL=http://localhost:3000 PROMPTFOO_REMOTE_APP_BASE_URL=http://localhost:3000 promptfoo share -y
```

This will create a shareable URL using your self-hosted service.

These configuration options can also be set under the `sharing` property of your promptfoo config:

```yaml
sharing:
  apiBaseUrl: http://localhost:3000
  appBaseUrl: http://localhost:3000
```

## Troubleshooting

If you encounter issues:

1. Check Docker logs: `docker logs promptfoo_container`
2. Ensure all required environment variables are set
3. Verify the volume mounting is correct for persistent storage
4. Check your firewall settings if you can't access the web UI

For more help, visit our [GitHub issues page](https://github.com/promptfoo/promptfoo/issues) or join our community Discord.
