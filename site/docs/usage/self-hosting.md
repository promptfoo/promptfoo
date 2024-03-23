---
sidebar_position: 50
---

# Self-hosting

promptfoo provides a Docker image that allows you to host a central server that stores your team's evals.

The self-hosted app consists of:

- Next.js application that runs the web ui.
- filesystem store that persists the eval results.
- key-value (KV) store that persists shared data (redis, filesystem, or memory).

## Setup

Clone the repository and see the provided [Dockerfile](https://github.com/promptfoo/promptfoo/blob/main/Dockerfile). Here's an example Docker command to build and run the container:

```bash
docker build --build-arg NEXT_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL=http://localhost:3000 -t promptfoo-ui .
docker run -p 3000:3000 -v /path/to/local_promptfoo:/root/.promptfoo promptfoo-ui
```

- `NEXT_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL` tells the web app where to send the API request when the user clicks the 'Share' button. This should be configured to match the URL of your self-hosted instance.
- The `-v` argument maps the working directory `/root/.promptfoo` to a path on your local filesystem `/path/to/local_promptfoo`. Replace this path with your preferred local path. You can omit this argument, but then your evals won't be persisted.

You can also set API credentials on the running Docker instance so that evals can be run on the server. For example, we'll set the OpenAI API key so users can run evals directly from the web ui:

```bash
docker run -p 3000:3000 -e -e OPENAI_API_KEY=sk-abc123 promptfoo-ui
```

## Configuring eval storage

promptfoo uses a sqlite database located in `/root/.promptfoo` on the image, as well as some other files in that directory to track state. Be sure to persist this directory (and the `promptfoo.db` file specifically) in order to save evals.

## Configuring the KV Store

By default, the application uses an in-memory store for shared results. However, you can configure it to use Redis or the filesystem by setting the appropriate environment variables. Below is a table of environment variables you can set to configure the KV store:

| Environment Variable             | Description                                                    | Default Value       |
| -------------------------------- | -------------------------------------------------------------- | ------------------- |
| `PROMPTFOO_SHARE_STORE_TYPE`     | The type of store to use (`memory`, `redis`, or `filesystem`). | `memory`            |
| `PROMPTFOO_SHARE_TTL`            | The time-to-live (TTL) for shared URLs in seconds.             | `1209600` (2 weeks) |
| `PROMPTFOO_SHARE_REDIS_HOST`     | The Redis host.                                                | -                   |
| `PROMPTFOO_SHARE_REDIS_PORT`     | The Redis port.                                                | -                   |
| `PROMPTFOO_SHARE_REDIS_PASSWORD` | The Redis password.                                            | -                   |
| `PROMPTFOO_SHARE_REDIS_DB`       | The Redis database number.                                     | `0`                 |
| `PROMPTFOO_SHARE_STORE_PATH`     | The filesystem path for storing shared results.                | `share-store`       |

## Pointing the promptfoo client to your hosted instance

When self-hosting, you need to set the environment variables so that the `promptfoo share` command knows how to reach your hosted application. Here's an example:

```bash
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
