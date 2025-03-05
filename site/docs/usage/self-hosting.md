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

- Share your evals with your team
- Run evals in your CI/CD pipeline and aggregate the results
- Keep sensitive data off of your local machine

The self-hosted app consists of an Express server that serves the web UI and API.

## Deployment Options

### Option 1: Docker Compose (Recommended)

Using Docker Compose is the simplest and most reliable way to run promptfoo:

1. Create a `docker-compose.yml` file:

```yaml
version: '3'

services:
  promptfoo:
    image: ghcr.io/promptfoo/promptfoo:latest
    ports:
      - '3000:3000'
    volumes:
      - promptfoo_data:/home/promptfoo/.promptfoo
    environment:
      # Add any API keys you need here
      # OPENAI_API_KEY: your_api_key
    restart: unless-stopped
    # Optional: Set resource limits
    # mem_limit: 1g
    # cpus: 1.0

volumes:
  promptfoo_data:
    # This creates a named volume with appropriate permissions
```

2. Run the container:

```bash
docker-compose up -d
```

This method uses Docker's named volumes which automatically handle permissions correctly.

### Option 2: Docker Run

If you prefer using Docker directly:

1. Pull the image:

```bash
docker pull ghcr.io/promptfoo/promptfoo:latest
```

2. Prepare a directory with proper permissions:

```bash
mkdir -p ~/promptfoo_data
chmod 755 ~/promptfoo_data && chown -R $(id -u):$(id -g) ~/promptfoo_data
```

> **Note on permissions**: The above approach uses more restrictive 755 permissions, which is generally more secure than 777. If you encounter permission errors, you may need to use `chmod 777` instead, but be aware this grants all users full access to the directory.

3. Run the container:

```bash
docker run -d --name promptfoo_container \
  --restart unless-stopped \
  -p 3000:3000 \
  -v ~/promptfoo_data:/home/promptfoo/.promptfoo \
  ghcr.io/promptfoo/promptfoo:latest
```

### Option 3: Kubernetes with Helm

For production deployments on Kubernetes, promptfoo provides a Helm chart:

1. Clone the repository to get the Helm chart:

```bash
git clone https://github.com/promptfoo/promptfoo.git
cd promptfoo
```

2. Install the chart:

```bash
helm install my-promptfoo ./helm/chart/promptfoo \
  --namespace promptfoo \
  --create-namespace \
  --set service.type=ClusterIP \
  --set domainName=promptfoo.example.com
```

3. For production deployments, consider these additional settings:

```bash
helm install my-promptfoo ./helm/chart/promptfoo \
  --namespace promptfoo \
  --create-namespace \
  --set service.type=ClusterIP \
  --set domainName=promptfoo.example.com \
  --set resources.requests.memory=512Mi \
  --set resources.limits.memory=1Gi \
  --set persistentVolumesClaims[0].size=10Gi \
  --set autoscaling.enabled=true
```

For more advanced configuration, see the `values.yaml` file in the Helm chart directory.

## Building from Source

If you need to customize the application or want to build from source:

1. Clone the repository:

```sh
git clone https://github.com/promptfoo/promptfoo.git
cd promptfoo
```

2. Build the Docker image:

```sh
docker build -t promptfoo:local .
```

3. Run the container:

```sh
# Create data directory with proper permissions
mkdir -p ~/promptfoo_data
chmod 755 ~/promptfoo_data && chown -R $(id -u):$(id -g) ~/promptfoo_data

# Run the container
docker run -d --name promptfoo_container \
  --restart unless-stopped \
  -p 3000:3000 \
  -v ~/promptfoo_data:/home/promptfoo/.promptfoo \
  promptfoo:local
```

## Production Configuration

### Data Persistence

promptfoo uses a SQLite database (`promptfoo.db`) located in `/home/promptfoo/.promptfoo` in the container. For production deployments, consider these best practices:

1. **Always use volume mounts** to persist data
2. **Implement regular backups** of your data directory
3. **Monitor disk space** to prevent database corruption

### Backup Strategy

To back up your promptfoo data:

```bash
# For Docker/Docker Compose installations
tar -czf promptfoo-backup-$(date +%Y%m%d).tar.gz -C ~/promptfoo_data .

# For Kubernetes installations
kubectl exec -n promptfoo $(kubectl get pods -n promptfoo -l app.kubernetes.io/name=promptfoo -o name | head -n 1) -- \
  tar -czf - -C /home/promptfoo/.promptfoo . > promptfoo-backup-$(date +%Y%m%d).tar.gz
```

### Environment Variables

| Variable                | Description                      | Default |
| ----------------------- | -------------------------------- | ------- |
| `API_PORT`              | Port to run the server on        | 3000    |
| `HOST`                  | Host to bind to                  | 0.0.0.0 |
| `OPENAI_API_KEY`        | OpenAI API key for running evals | -       |
| `ANTHROPIC_API_KEY`     | Anthropic API key                | -       |
| `PROMPTFOO_SELF_HOSTED` | Indicates server is self-hosted  | 1       |

### Security Considerations

1. **API Keys**: Store API keys securely using environment variables or secrets management
2. **Authentication**: Consider using a reverse proxy (like Nginx) with basic authentication for public deployments
3. **HTTPS**: Use a reverse proxy to terminate HTTPS for production deployments
4. **Resource Limits**: Always set memory and CPU limits to prevent resource exhaustion

## Client Configuration

To point the promptfoo CLI to your hosted instance:

```sh
# Configure CLI to use your hosted instance
export PROMPTFOO_REMOTE_API_BASE_URL=https://promptfoo.example.com
export PROMPTFOO_REMOTE_APP_BASE_URL=https://promptfoo.example.com

# Test sharing an eval
promptfoo share -y
```

These configuration options can also be set in your promptfoo config:

```yaml
sharing:
  apiBaseUrl: https://promptfoo.example.com
  appBaseUrl: https://promptfoo.example.com
```

## Troubleshooting

### Permission Denied Errors

If you see a permission error like:

```
Error: EACCES: permission denied, open '/home/promptfoo/.promptfoo/evalLastWritten'
```

This means the container's `promptfoo` user doesn't have permission to write to the mounted volume. Fix this with one of these methods:

1. **Use Docker Compose with named volumes** (recommended)
2. **Fix permissions on your host directory**:
   ```bash
   mkdir -p ~/promptfoo_data
   chmod 777 ~/promptfoo_data
   ```
3. **Use a temporary container to set permissions**:
   ```bash
   mkdir -p ~/promptfoo_data
   docker run --rm -v ~/promptfoo_data:/data alpine chmod -R 777 /data
   ```

### Node.js Version Issues

promptfoo requires Node.js v20+ for certain components. If you see errors like:

```
npm WARN EBADENGINE Unsupported engine {
  required: { node: '>=20.18.1' },
  current: { node: 'v18.19.1' }
}
```

Update your Node.js installation to version 20 or later.

### Container Fails to Start

If the container exits immediately, check the logs:

```bash
docker logs promptfoo_container
```

Common issues include:

- Port 3000 already in use
- Insufficient permissions on mounted volumes
- Memory constraints
- SQLite database corruption

### Database Issues

If you experience database errors:

1. Stop the container
2. Backup your data directory
3. Remove the `promptfoo.db` file
4. Restart the container

## Monitoring

For production deployments, consider monitoring:

1. **Container health**: Set up health checks or use the built-in Docker health checks
2. **Resource usage**: Monitor CPU, memory, and disk usage
3. **Application logs**: Check container logs for errors or warnings

## Upgrading

To upgrade to a newer version:

```bash
# Using Docker Compose
docker-compose pull
docker-compose up -d

# Using Docker directly
docker pull ghcr.io/promptfoo/promptfoo:latest
docker stop promptfoo_container
docker rm promptfoo_container
docker run -d --name promptfoo_container \
  --restart unless-stopped \
  -p 3000:3000 \
  -v ~/promptfoo_data:/home/promptfoo/.promptfoo \
  ghcr.io/promptfoo/promptfoo:latest

# Using Helm
helm upgrade my-promptfoo ./helm/chart/promptfoo --namespace promptfoo
```

Always back up your data before upgrading.

## System Requirements

### Client Requirements

- **Operating System**: Linux, macOS, Windows
- **CPU**: 2+ cores
- **RAM**: 4 GB minimum
- **Storage**: 10 GB minimum
- **Dependencies**: Node.js v20+

### Server Requirements

#### Docker Environment

- **Docker**: 20.10+ or Docker Desktop
- **Docker Compose**: 2.x+ (if using Docker Compose)
- **Resources**:
  - 1 CPU core minimum
  - 512MB RAM minimum (1GB+ recommended)
  - 5GB storage minimum for database and container

#### Kubernetes Environment

- **Kubernetes**: 1.19+
- **Helm**: 3.x
- **Resources**:
  - 1 CPU core request, 2 core limit recommended
  - 512MB RAM request, 1GB limit recommended
  - 10GB+ persistent volume

For larger teams or heavier usage patterns, consider increasing the resources accordingly.
