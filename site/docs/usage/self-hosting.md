---
sidebar_position: 50
title: Self-hosting
description: Self-host a Promptfoo server with Docker, Docker Compose, or Helm. Configure persistent storage, share eval results, and troubleshoot common deployment issues.
keywords:
  - AI testing
  - configuration
  - Docker
  - Docker Compose
  - Helm
  - Kubernetes
  - LLM eval
  - LLM evaluation
  - promptfoo
  - self-hosting
  - setup guide
  - team collaboration
---

# Self-hosting Promptfoo

Use the Promptfoo Docker image to host a server that stores and shares eval results.

Self-hosting enables you to:

- Share evals to a private instance
- Run evals in your CI/CD pipeline and aggregate results
- Keep sensitive data off your local machine

:::caution Enterprise Customers
If you are an enterprise customer, please do not install this version. Contact us instead for credentials for the enterprise image.
:::

The self-hosted app is an Express server serving the web UI and API.

:::warning
**Self-hosting is not recommended for production use cases.**

- Uses a local SQLite database that requires manual persistence management and cannot be shared across replicas
- Built for individual or experimental usage
- No multi-team support or role-based access control.
- No support for horizontal scalability. Evaluation jobs live in each server's memory and multiple pods cannot share the SQLite database, so running more than one replica (for example in Kubernetes) will lead to "Job not found" errors.
- No built-in authentication or SSO capabilities

For production deployments requiring horizontal scaling, shared databases, or multi-team support, see our [Enterprise platform](/docs/enterprise/).
:::

## Method 1: Using Pre-built Docker Images (Recommended Start)

Get started quickly using a pre-built image.

### 1. Pull the Image

Pin a release so you can check the image and its permissions before an upgrade.

```bash
docker pull ghcr.io/promptfoo/promptfoo:0.126.0

# Optional image provenance check
gh attestation verify oci://ghcr.io/promptfoo/promptfoo:0.126.0 --owner promptfoo
```

### 2. Run the Container

:::note Linux bind mounts

With rootful Docker and no user namespace remapping, check the effective user and group IDs of the image you will run. Use these values to prepare a **new, dedicated** data directory.

```bash
image=ghcr.io/promptfoo/promptfoo:0.126.0
uid=$(docker run --rm --network none --entrypoint id "$image" -u)
gid=$(docker run --rm --network none --entrypoint id "$image" -g)
sudo install -d -m 700 -o "${uid:?}" -g "${gid:?}" ./promptfoo_data
```

On SELinux hosts, append `:Z` to the bind mount in Docker or Compose for a private label. Use this only on a dedicated directory because it relabels the files inside.

For rootless Docker or user namespace remapping, mount a new named volume with `-v promptfoo_data:/home/promptfoo/.promptfoo`. Docker Desktop for Mac needs only `mkdir -p ./promptfoo_data` for a bind mount.

:::

Run the container, mapping a local directory for data persistence:

```bash
docker run -d \
  --name promptfoo_container \
  -p 127.0.0.1:3000:3000 \
  -v "$PWD/promptfoo_data:/home/promptfoo/.promptfoo" \
  -e OPENAI_API_KEY \
  ghcr.io/promptfoo/promptfoo:0.126.0
```

The mount preserves the SQLite database and media when you replace the container. Export `OPENAI_API_KEY` in your shell only if you want the server to use it. The port binds to loopback because the server has no built-in authentication. For remote access, put an authenticated TLS proxy in front of both the UI and API.

Access the UI at `http://localhost:3000`.

## Method 2: Using Docker Compose

For managing multi-container setups or defining configurations declaratively, use Docker Compose.

### 1. Create `docker-compose.yml`

Create a `docker-compose.yml` file in your project directory:

```yaml title="docker-compose.yml"
services:
  promptfoo_container: # Consistent service and container name
    image: ghcr.io/promptfoo/promptfoo:0.126.0
    ports:
      - '127.0.0.1:3000:3000'
    volumes:
      # Map host directory to container data directory for persistence
      # Create ./promptfoo_data on your host first!
      - ./promptfoo_data:/home/promptfoo/.promptfoo
    environment:
      # Optional: Adjust chunk size for large evals (See Troubleshooting)
      - PROMPTFOO_SHARE_CHUNK_SIZE=10
      - OPENAI_API_KEY
```

For a Docker-managed volume, use `promptfoo_data:/home/promptfoo/.promptfoo` and declare `volumes: { promptfoo_data: {} }` at the top level of the Compose file.

### 2. Create Host Directory (if using host path)

Prepare `./promptfoo_data` using the [bind mount instructions](#2-run-the-container) for your host. On SELinux hosts, use `./promptfoo_data:/home/promptfoo/.promptfoo:Z`.

### 3. Run with Docker Compose

Start the container in detached mode:

```bash
docker compose up -d
```

Stop the container (data remains in `./promptfoo_data` or the named volume):

```bash
docker compose stop
```

Stop and remove the container (data remains):

```bash
docker compose down
```

## Method 3: Using Kubernetes with Helm

:::warning
Helm support is currently experimental. Please report any issues you encounter.
:::

Deploy promptfoo to Kubernetes using the provided Helm chart located within the main promptfoo repository.

:::info
Keep `replicaCount: 1` (the default) as the self-hosted server uses a local SQLite database and in-memory job queue that cannot be shared across multiple replicas.
:::

### Prerequisites

- A Kubernetes cluster (e.g., Minikube, K3s, GKE, EKS, AKS)
- Helm 3 or 4 installed (`brew install helm` or see [Helm docs](https://helm.sh/docs/intro/install/))
- `kubectl` configured to connect to your cluster
- Git installed

### Installation

1. **Clone the promptfoo Repository:**
   If you haven't already, clone the main promptfoo repository:

   ```bash
   git clone https://github.com/promptfoo/promptfoo.git
   cd promptfoo
   ```

2. Check the chart version in the repository root.

   ```bash
   helm show chart ./helm/chart/promptfoo
   ```

:::warning Check for public routes

Chart 0.1.0 always creates a Traefik Ingress, even with `service.type: ClusterIP` and `ingress.enabled: false`. Use Docker or Compose if you only have this chart. For a private Kubernetes install, use a chart that supports disabling Ingress and inspect the rendered resources before installing.

:::

### Configuration

For a new installation, save the following values in `my-values.yaml`. Check the image's user and group IDs as [shown above](#2-run-the-container). If they differ, adjust `securityContext.runAsUser`, `securityContext.runAsGroup` and `podSecurityContext.fsGroup` for that image.

```yaml title="my-values.yaml"
replicaCount: 1
image:
  tag: '0.126.0'
podSecurityContext:
  fsGroup: 101
persistentVolumesClaims:
  - name: promptfoo
    size: 10Gi
    accessModes: [ReadWriteOnce]
service:
  type: ClusterIP
ingress:
  enabled: false
```

Preview the resources.

```bash
helm template my-promptfoo ./helm/chart/promptfoo -f my-values.yaml
```

Check that the Service is a ClusterIP, the Deployment has one replica and the output contains no Ingress. Then install and forward the service to `http://localhost:3000`.

```bash
helm install my-promptfoo ./helm/chart/promptfoo -f my-values.yaml
kubectl port-forward service/my-promptfoo 3000:3000
```

ClusterIP still permits in-cluster access. Limit access with a network policy and require authentication and TLS before exposing the server. For an upgrade, review your existing route before disabling Ingress.

Refer to the [chart's `values.yaml`](https://github.com/promptfoo/promptfoo/blob/main/helm/chart/promptfoo/values.yaml) for all available options.

### Persistence Considerations

Ensure your Kubernetes cluster has a default StorageClass configured, or explicitly specify a `storageClassName` in your values that supports `ReadWriteOnce` access mode for the PVC.

## Alternative: Building from Source

If you want to build the image yourself:

### 1. Clone the Repository

```sh
git clone https://github.com/promptfoo/promptfoo.git
cd promptfoo
```

### 2. Build the Docker Image

```sh
# Build for your current architecture
docker build -t promptfoo:custom .

# Or build for a specific platform like linux/amd64
# docker build --platform linux/amd64 -t promptfoo:custom .
```

Images built from this Dockerfile are marked as custom containers. To apply a Promptfoo update,
first advance the checkout to the desired release, then rebuild and redeploy. Choose a base image with a
[supported Node.js version](/docs/installation#nodejs-runtime-support). Use `docker build --pull` when a
tagged parent image must be refreshed. An unchanged build context produces the same Promptfoo
version.

To refresh Alpine packages even when the parent image is unchanged, change the
`OS_PACKAGE_REFRESH` build argument on each rebuild:

```sh
docker build --pull --build-arg OS_PACKAGE_REFRESH="$(date +%s)" -t promptfoo:custom .
```

Custom Dockerfiles that bake Promptfoo into another base image should identify themselves so update
notices do not suggest a host-level `npm` or `npx` command:

```dockerfile
ENV PROMPTFOO_RUNNING_IN_DOCKER=1
ENV PROMPTFOO_OFFICIAL_DOCKER_IMAGE=0
```

If your Dockerfile derives from the official Promptfoo image, reset the upstream-image marker while
keeping container detection enabled. This prevents update notices from suggesting that users replace
your customized image with the upstream image:

```dockerfile
FROM ghcr.io/promptfoo/promptfoo:latest
ENV PROMPTFOO_OFFICIAL_DOCKER_IMAGE=0
```

Existing derived images that inherit the marker receive safe fallback guidance to refresh the
Promptfoo base, rebuild the customized image, and then redeploy it.

### 3. Run the Custom Docker Container

Use the same `docker run` command as in Method 1, but replace the image name:

```bash
docker run -d \
  --name promptfoo_custom_container \
  -p 127.0.0.1:3000:3000 \
  -v "$PWD/promptfoo_data:/home/promptfoo/.promptfoo" \
  promptfoo:custom
```

Remember to include the volume mount (`-v`) for data persistence.

## Configuring the CLI

When self-hosting, configure the `promptfoo` CLI to communicate with your instance instead of the default cloud service. This is necessary for commands like `promptfoo share`.

Set these environment variables before running `promptfoo` commands:

```sh
export PROMPTFOO_REMOTE_API_BASE_URL=http://your-server-address:3000
export PROMPTFOO_REMOTE_APP_BASE_URL=http://your-server-address:3000
```

Replace `http://your-server-address:3000` with the actual URL of your self-hosted instance (e.g., `http://localhost:3000` if running locally).

After configuring the CLI, you need to explicitly upload eval results to your self-hosted instance:

1. Run `promptfoo eval` to execute your eval
2. Run `promptfoo share` to upload the results
3. Or use `promptfoo eval --share` to do both in one command

Alternatively, configure these URLs permanently in your `promptfooconfig.yaml`:

```yaml title="promptfooconfig.yaml"
# Configure sharing to your self-hosted instance
sharing:
  apiBaseUrl: http://your-server-address:3000
  appBaseUrl: http://your-server-address:3000

prompts:
  - 'Tell me about {{topic}}'

providers:
  - openai:o4-mini
# ... rest of config ...
```

### Configuration Priority

promptfoo resolves the sharing target URL in this order (highest priority first):

1. Config file (`sharing.apiBaseUrl` and `sharing.appBaseUrl`)
2. Environment variables (`PROMPTFOO_REMOTE_API_BASE_URL`, `PROMPTFOO_REMOTE_APP_BASE_URL`)
3. Cloud configuration (set via `promptfoo auth login`)
4. Default promptfoo cloud URLs

### Expected URL Format

When configured correctly, your self-hosted server handles requests like:

- **API Endpoint**: `http://your-server:3000/api/eval`
- **Web UI Link**: `http://your-server:3000/eval/{evalId}`

## Advanced Configuration

### Eval Storage Path

By default, promptfoo stores its SQLite database (`promptfoo.db`) in `/home/promptfoo/.promptfoo` _inside the container_. Ensure this directory is mapped to persistent storage using volumes (as shown in the Docker and Docker Compose examples) to save your evals across container restarts.

By default, promptfoo externalizes large binary outputs (for example, images/audio) to the local filesystem under `/home/promptfoo/.promptfoo/blobs` and replaces inline base64 with lightweight references. To keep media inline (legacy behavior), set `PROMPTFOO_INLINE_MEDIA=true`. Make sure your volume mapping includes `/home/promptfoo/.promptfoo/blobs` so media persists across restarts.

`PROMPTFOO_MEDIA_PATH` applies only to legacy `storageRef` media, which defaults to `/home/promptfoo/.promptfoo/media`; it does not move the `blobs` directory. Set it before media storage is first used: that location stays fixed for the process.

### Custom Config Directory

You can override the default internal configuration directory (`/home/promptfoo/.promptfoo`) using the `PROMPTFOO_CONFIG_DIR` environment variable. If set, promptfoo uses this path _inside the container_ for both configuration files and the `promptfoo.db` database. You still need to map this custom path to a persistent volume.

To use `/app/data`, prepare a new `./my_custom_data` directory using the [bind mount instructions](#2-run-the-container) for your host.

```bash
docker run -d --name promptfoo_container -p 127.0.0.1:3000:3000 \
  -v "$PWD/my_custom_data:/app/data" \
  -e PROMPTFOO_CONFIG_DIR=/app/data \
  ghcr.io/promptfoo/promptfoo:0.126.0
```

Unlike the default data directory, a new custom mount path is not pre-owned by the container user. Named volumes mounted at custom paths also need writable ownership or permissions.

### Provider Customization

Customize which LLM providers appear in the eval creator UI for cost control, compliance, or routing through internal gateways.

Place a `ui-providers.yaml` file in your `.promptfoo` directory (same location as `promptfoo.db`). When this file exists, only listed providers appear in the UI.

**Example configuration:**

```yaml title="ui-providers.yaml"
providers:
  # Simple provider IDs
  - openai:gpt-5.4-mini
  - anthropic:messages:claude-sonnet-5

  # With labels and defaults
  - id: openai:gpt-5.1
    label: GPT-5.1 (Company Approved)
    config:
      temperature: 0.7
      max_tokens: 4096

  # Custom HTTP provider with env var credentials
  - id: 'http://llm-gateway.company.com/v1'
    label: Internal Gateway
    config:
      method: POST
      headers:
        Authorization: 'Bearer {{ env.INTERNAL_API_KEY }}'
```

**Docker deployment:**

For a rootful Linux bind mount, use the user and group IDs from the [directory setup](#2-run-the-container). Install the file before starting the container and export `INTERNAL_API_KEY` in your shell.

```bash
sudo install -o "${uid:?}" -g "${gid:?}" -m 600 ui-providers.yaml ./promptfoo_data/ui-providers.yaml

docker run -d \
  --name promptfoo_container \
  -p 127.0.0.1:3000:3000 \
  -v "$PWD/promptfoo_data:/home/promptfoo/.promptfoo" \
  -e INTERNAL_API_KEY \
  ghcr.io/promptfoo/promptfoo:0.126.0
```

On Docker Desktop for Mac, copy the file with `cp ui-providers.yaml ./promptfoo_data/`. If the container is already running, restart it after replacing the configuration file.

**Kubernetes ConfigMap:**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: promptfoo-providers
data:
  ui-providers.yaml: |
    providers:
      - openai:gpt-5.1
      - anthropic:messages:claude-sonnet-5
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: promptfoo
spec:
  template:
    spec:
      containers:
        - name: promptfoo
          image: ghcr.io/promptfoo/promptfoo:0.126.0
          volumeMounts:
            - name: config
              mountPath: /home/promptfoo/.promptfoo/ui-providers.yaml
              subPath: ui-providers.yaml
      volumes:
        - name: config
          configMap:
            name: promptfoo-providers
```

:::info Behavior Changes

When `ui-providers.yaml` exists:

- Only configured providers shown (replaces default ~600 providers)
- "Reference Local Provider" button hidden in eval creator
- Configuration is cached - restart required after changes: `docker restart promptfoo_container`

:::

:::caution Security - Credentials

**DO NOT store API keys in ui-providers.yaml**. Use environment variables with Nunjucks syntax:

```yaml
# ui-providers.yaml
providers:
  - id: 'http://internal-api.com/v1'
    config:
      headers:
        Authorization: 'Bearer {{ env.INTERNAL_API_KEY }}'
```

```bash
# Pass via environment
docker run -e INTERNAL_API_KEY=your-key ...
```

For Kubernetes, use Secrets (not ConfigMaps) for sensitive data.

:::

**Configuration fields:**

```yaml
providers:
  - id: string # Required - Provider identifier
    label: string # Optional - Display name
    config: # Optional - Default settings
      temperature: number # 0.0-2.0
      max_tokens: number
      # HTTP providers
      method: string # POST, GET, etc.
      headers: object # Custom headers
      # Cloud providers
      region: string # AWS region, etc.
```

**Provider ID formats:**

- **OpenAI:** `openai:gpt-5.1`, `openai:gpt-5.4-mini`
- **Anthropic:** `anthropic:messages:claude-sonnet-5`
- **AWS Bedrock:** `bedrock:us.anthropic.claude-sonnet-5`
- **Azure OpenAI:** `azureopenai:chat:deployment-name`
- **Custom HTTP:** `http://your-api.com/v1` or `https://...`

See [Provider Documentation](/docs/providers/) for complete list.

**Troubleshooting:**

**Providers not updating:** Restart required after config changes.

```bash
docker restart promptfoo_container
# or: docker compose restart
# or: kubectl rollout restart deployment/promptfoo
```

**Providers missing:** Check logs for validation errors:

```bash
docker logs promptfoo_container | grep "Invalid provider"
```

Common issues: missing `id` field, invalid provider ID format, YAML syntax errors.

**Config not detected:** Verify file location and permissions:

```bash
docker exec promptfoo_container ls -la /home/promptfoo/.promptfoo/
docker exec promptfoo_container cat /home/promptfoo/.promptfoo/ui-providers.yaml
```

File must be named `ui-providers.yaml` or `ui-providers.yml` (case-sensitive on Linux).

## Deploying Behind a Reverse Proxy with Base Path

To serve promptfoo at a URL prefix (e.g., `https://example.com/promptfoo/`), rebuild the Docker image with `VITE_PUBLIC_BASENAME` and configure your reverse proxy to strip the prefix.

### Build the Image

```bash
docker build --build-arg VITE_PUBLIC_BASENAME=/promptfoo -t my-promptfoo .
```

### Nginx Configuration

```nginx
location /promptfoo/ {
    proxy_pass http://localhost:3000/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

### Traefik Configuration

```yaml
http:
  routers:
    promptfoo:
      rule: 'PathPrefix(`/promptfoo`)'
      middlewares:
        - strip-promptfoo
      service: promptfoo
  middlewares:
    strip-promptfoo:
      stripPrefix:
        prefixes:
          - '/promptfoo'
  services:
    promptfoo:
      loadBalancer:
        servers:
          - url: 'http://promptfoo:3000'
```

The `VITE_PUBLIC_BASENAME` build argument configures the frontend to use the correct paths for routing, API calls, and WebSocket connections.

## Specifications

### Client Requirements (Running `promptfoo` CLI)

- **OS**: Linux, macOS, Windows
- **CPU**: 2+ cores, 2.0GHz+ recommended
- **GPU**: Not required
- **RAM**: 4 GB+
- **Storage**: 10 GB+
- Install npm and a [supported Node.js version](/docs/installation#nodejs-runtime-support).

### Server Requirements (Hosting the Web UI/API)

The server component is optional; you can run evals locally or in CI/CD without it.

**Host Machine:**

- **OS**: Any OS capable of running Docker/Kubernetes
- **CPU**: 4+ cores recommended
- **RAM**: 8GB+ (16GB recommended for heavy use)
- **Storage**: 100GB+ recommended for container volumes and database (SSD recommended for database volume)

## Troubleshooting

### Lost Data After Container Restart

**Problem**: Evals disappear after `docker compose down` or container restarts.

**Solution**: This indicates missing or incorrect volume mapping. Ensure your `docker run` command or `docker-compose.yml` correctly maps a host directory or named volume to `/home/promptfoo/.promptfoo` (or your `PROMPTFOO_CONFIG_DIR` if set) inside the container. Review the `volumes:` section in the examples above.

### Container Exits With "Unable to open connection to local database"

**Problem**: The container stops right after starting, and `docker logs` shows `Unable to open connection to local database /home/promptfoo/.promptfoo/promptfoo.db: 14`.

The server needs write access to the database and its directory. Stop the container and back up the data before changing permissions. [Check the effective IDs and SELinux label](#2-run-the-container) for the image you deployed, then fix permissions on the dedicated data directory and its files. For a new installation, you can use a named volume at `/home/promptfoo/.promptfoo`.

### Results Not Appearing in Self-Hosted UI

**Problem**: Running `promptfoo eval` stores results locally instead of showing them in the self-hosted UI.

**Solution**:

1. By default, `promptfoo eval` stores results locally (run `promptfoo view` to view them)
2. To upload results to your self-hosted instance, run `promptfoo share` after eval
3. Configure your self-hosted instance using ONE of these methods:

   **Option A: Environment Variables (temporary)**

   ```bash
   export PROMPTFOO_REMOTE_API_BASE_URL=http://your-server:3000
   export PROMPTFOO_REMOTE_APP_BASE_URL=http://your-server:3000
   ```

   **Option B: Config File (permanent - recommended)**

   ```yaml title="promptfooconfig.yaml"
   sharing:
     apiBaseUrl: http://your-server:3000
     appBaseUrl: http://your-server:3000
   ```

   Replace `your-server` with your actual server address (e.g., `192.168.1.100`, `promptfoo.internal.company.com`, etc.)

4. Then run: `promptfoo eval` followed by `promptfoo share`

:::tip What to Expect
After running `promptfoo share`, you should see output like:

```
View results: http://192.168.1.100:3000/eval/abc-123-def
```

This URL points to your self-hosted instance, not the local viewer.
:::

## See Also

- [Configuration Reference](../configuration/reference.md)
- [Command Line Interface](./command-line.md)
- [Sharing Results](./sharing.md)
