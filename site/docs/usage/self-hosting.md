---
sidebar_position: 50
title: Self-hosting Guide for promptfoo
description: Learn how to self-host the promptfoo application using Docker. Follow this step-by-step guide to set up and configure your own instance.
keywords:
  - promptfoo
  - self-hosting
  - Docker
  - setup guide
  - configuration
---

# Self-hosting Guide

promptfoo provides a Docker image that allows you to host a central server that stores your team's evals. This guide will walk you through the setup process and configuration options.

## Introduction

This guide will help you set up and run a self-hosted instance of the promptfoo application using Docker. You'll learn how to configure the necessary environment variables and persist data for long-term use.

## Prerequisites

Before you begin, ensure you have the following:

- Docker installed on your system.
- Basic understanding of Docker commands.
- System requirements: At least 2GB of RAM and 10GB of available storage.

## Setup

### Step 1: Clone the Repository

Clone the promptfoo repository from GitHub.

```sh
git clone https://github.com/promptfoo/promptfoo.git
cd promptfoo
```

### Step 2: Build the Docker Image

Build the Docker image using the provided Dockerfile.

```sh
docker build --build-arg NEXT_PUBLIC_PROMPTFOO_BASE_URL=http://localhost:3000 -t promptfoo-ui .
```

### Step 3: Run the Docker Container

Run the Docker container with the following command:

```sh
docker run -d --name promptfoo_container -p 3000:3000 -v /path/to/local_promptfoo:/root/.promptfoo promptfoo-ui
```

- `NEXT_PUBLIC_PROMPTFOO_BASE_URL` tells the web app where to send the API request when the user clicks the 'Share' button. This should be configured to match the URL of your self-hosted instance.
- The `-v` argument maps the working directory `/root/.promptfoo` to a path on your local filesystem `/path/to/local_promptfoo`. Replace this path with your preferred local path. You can omit this argument, but then your evals won't be persisted.

### Step 4: Set API Credentials

Set API credentials on the running Docker instance so that evals can be run on the server. For example, set the OpenAI API key:

```sh
docker run -d --name promptfoo_container -p 3000:3000 -e OPENAI_API_KEY=sk-abc123 promptfoo-ui
```

## Configuring Eval Storage

promptfoo uses a SQLite database located in `/root/.promptfoo` on the image, as well as some other files in that directory to track state. Be sure to persist this directory (and the `promptfoo.db` file specifically) to save evals.

## Configuring the KV Store

By default, the application uses an in-memory store for shared results. However, you can configure it to use Redis or the filesystem by setting the appropriate environment variables:

| Environment Variable             | Description                                                    | Default Value       |
| -------------------------------- | -------------------------------------------------------------- | ------------------- |
| `PROMPTFOO_SHARE_STORE_TYPE`     | The type of store to use (`memory`, `redis`, or `filesystem`). | `memory`            |
| `PROMPTFOO_SHARE_TTL`            | The time-to-live (TTL) for shared URLs in seconds.             | `1209600` (2 weeks) |
| `PROMPTFOO_SHARE_REDIS_HOST`     | The Redis host.                                                | -                   |
| `PROMPTFOO_SHARE_REDIS_PORT`     | The Redis port.                                                | -                   |
| `PROMPTFOO_SHARE_REDIS_PASSWORD` | The Redis password.                                            | -                   |
| `PROMPTFOO_SHARE_REDIS_DB`       | The Redis database number.                                     | `0`                 |
| `PROMPTFOO_SHARE_STORE_PATH`     | The filesystem path for storing shared results.                | `share-store`       |

### Example Redis Configuration

To use Redis for the KV store, set the environment variables like this:
```sh
docker run -d --name promptfoo_container -p 3000:3000 -v /path/to/local_promptfoo:/root/.promptfoo -e PROMPTFOO_SHARE_STORE_TYPE=redis -e PROMPTFOO_SHARE_REDIS_HOST=redis_host -e PROMPTFOO_SHARE_REDIS_PORT=6379 -e PROMPTFOO_SHARE_REDIS_PASSWORD=your_password promptfoo-ui
```

## Pointing the promptfoo Client to Your Hosted Instance

Set environment variables so that the `promptfoo share` command knows how to reach your hosted application:
```sh
PROMPTFOO_REMOTE_API_BASE_URL=http://localhost:3000 PROMPTFOO_REMOTE_APP_BASE_URL=http://localhost:3000 promptfoo share -y
```
This will create a shareable URL using your self-hosted service.

Alternatively, these configuration options can be set in the `promptfoo` config file:
```yaml
sharing:
  apiBaseUrl: http://localhost:3000
  appBaseUrl: http://localhost:3000
```

## Troubleshooting

### Common Issues

- **Container Fails to Start**: Ensure all environment variables are correctly set and ports are not in use.
- **Data Not Persisting**: Verify the volume mount path is correct and the container has write permissions.

For further assistance, refer to the [Docker documentation](https://docs.docker.com/get-started/) and the [promptfoo GitHub repository](https://github.com/promptfoo/promptfoo).
