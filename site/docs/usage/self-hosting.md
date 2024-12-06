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

- The self-hosted app is an Express server that serves the web UI and API.

## Using Pre-built Docker Images

A quick way to get started is to use a pre-built image.

To use a pre-built image:

1. Pull the image:

```bash
docker pull ghcr.io/promptfoo/promptfoo:latest
```

You can use specific version tags instead of `latest` to pin to a specific version.

2. Run the container:

```bash
docker run -d --name promptfoo_container -p 3000:3000 -v /path/to/local_promptfoo:/home/promptfoo/.promptfoo ghcr.io/promptfoo/promptfoo:latest
```

Key points:

- `-v /path/to/local_promptfoo:/home/promptfoo/.promptfoo` maps the container's working directory to your local filesystem. Replace `/path/to/local_promptfoo` with your preferred path.
- Omitting the `-v` argument will result in non-persistent evals.
- Add any api keys as environment variables on the docker container. For example, `-e OPENAI_API_KEY=sk-abc123` sets the OpenAI API key so users can run evals directly from the web UI. Replace `sk-abc123` with your actual API key.

## Building from Source

### 1. Clone the Repository

First, clone the promptfoo repository from GitHub:

```sh
git clone https://github.com/promptfoo/promptfoo.git
cd promptfoo
```

### 2. Build the Docker Image

Build the Docker image with the following command:

```sh
docker build -t promptfoo .
```

### 3. Run the Docker Container

Launch the Docker container using this command:

```sh
docker run -d --name promptfoo_container -p 3000:3000 -v /path/to/local_promptfoo:/home/promptfoo/.promptfoo promptfoo
```

## Advanced Configuration

### Eval Storage

promptfoo uses a SQLite database (`promptfoo.db`) located in `/home/promptfoo/.promptfoo` on the image. Ensure this directory is persisted to save your evals. Pass `-v /path/to/local_promptfoo:/home/promptfoo/.promptfoo` to the `docker run` command to persist the evals.

## Pointing promptfoo to your hosted instance

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

## Specifications

Promptfoo comes in two parts:

- A client tool for running evals and interacting with the Promptfoo API.
- A web server that stores and analyzes results, serves dashboards, enables sharing, and provides a UI for viewing reports from other users.

### Client

The Promptfoo client is a Node.js application that runs on all modern operating systems. It can be run on a laptop or personal computer, in a CI/CD pipeline, or on a server.

#### Requirements

- **Operating System**: Linux, MacOS, Windows (Linux recommended for server installations)
- **CPU**: 2+ CPU cores, 2.0GHz or faster recommended
- **GPU**: Not required
- **RAM**: 4 GB
- **Storage**: 10 GB
- **Dependencies**:
  - **Node.js**: Version 18 or newer
  - **Package Manager**: npm (comes with Node.js)

### Server

The Promptfoo server is a Node.js application that runs on a server. It can be run in a Docker container or as a standalone Node.js application.

Note that the server is _optional_ for running evals or red teams with Promptfoo. You can run evals locally or in a CI/CD pipeline without running the server.

#### Requirements

Docker Environment

- **Docker Engine**: 20.10 or newer
- **Docker Compose**: 2.x or newer

Results Server Host

- **OS**: Anything capable of running Docker (Kubernetes, Azure Container Instances, etc.)
- **CPU**: 4+ cores
- **RAM**: 8GB minimum (16GB recommended)
- **Storage**:
  - 100GB+ for container volumes and database
  - Device mapper or overlay2 storage driver recommended
  - SSD storage recommended for database volumes
