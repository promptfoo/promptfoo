# GCP Self-Hosted GitHub Runners Migration Plan

## Scope: Ubuntu Workflows Only

This plan migrates **Ubuntu-based GitHub Actions jobs** to Google Cloud self-hosted runners using Cloud Run Worker Pools with CREMA autoscaling. Windows and macOS jobs remain on GitHub-hosted runners.

---

## Current State Analysis

### Ubuntu Jobs to Migrate (main.yml)

| Job                           | Timeout | Dependencies                         | Notes                  |
| ----------------------------- | ------- | ------------------------------------ | ---------------------- |
| `test` (ubuntu-latest matrix) | 10 min  | Node 20/22/24, Python 3.14, Ruby 4.0 | 3 parallel jobs        |
| `build`                       | 5 min   | Node 20/22/24                        | 3 parallel jobs        |
| `style-check`                 | 5 min   | Node (from .nvmrc)                   | Biome, Prettier        |
| `shell-format`                | 5 min   | None                                 | Shell formatting       |
| `assets`                      | 5 min   | Node                                 | JSON schema gen        |
| `python`                      | 5 min   | Python 3.9/3.14                      | 2 parallel jobs        |
| `docs`                        | 5 min   | Node                                 | Docusaurus build       |
| `code-scan-action`            | 5 min   | Node                                 | Action build           |
| `site-tests`                  | 5 min   | Node                                 | Docusaurus tests       |
| `webui`                       | 10 min  | Node                                 | React tests + coverage |
| `integration-tests`           | 5 min   | Node, Python, Ruby                   | Full integration       |
| `smoke-tests`                 | 7 min   | Node, Python, Ruby                   | Production-like        |
| `share-test`                  | 10 min  | Node                                 | Server + eval          |
| `redteam`                     | 10 min  | Node                                 | Security tests         |
| `redteam-staging`             | 10 min  | Node                                 | Staging API            |
| `actionlint`                  | 5 min   | None                                 | Workflow linting       |
| `ruby`                        | 5 min   | Ruby 3.0/3.4                         | 2 parallel jobs        |
| `golang`                      | 5 min   | Go 1.25                              | Wrapper tests          |

**Total Ubuntu jobs in main.yml:** ~22 (including matrix expansions)

### Jobs Staying on GitHub-Hosted Runners

| Job                     | Runner         | Reason                             |
| ----------------------- | -------------- | ---------------------------------- |
| `test` (windows-latest) | windows-latest | Windows not supported on Cloud Run |
| `test` (macOS-latest)   | macos-latest   | macOS requires Mac hardware        |

### Other Workflows with Ubuntu Jobs

| Workflow                 | Jobs                       | Priority         |
| ------------------------ | -------------------------- | ---------------- |
| `docker.yml`             | test, build, merge, attest | Phase 2          |
| `release-please.yml`     | release, build, publish    | Phase 2          |
| `claude-code-review.yml` | claude-review              | Low (infrequent) |
| `claude.yml`             | claude                     | Low (infrequent) |
| Others                   | Various                    | Low              |

---

## GCP Project Setup

### Step 1: Create New Project

```bash
# Set variables
export PROJECT_ID="promptfoo-ci-runners"
export BILLING_ACCOUNT="01E03B-63B3BD-BFD4AF"  # Michael Billing
export ORG_ID="492621846729"  # promptfoo.dev
export REGION="us-central1"
export GITHUB_REPO="promptfoo/promptfoo"

# Create project
gcloud projects create ${PROJECT_ID} \
  --name="Promptfoo CI Runners" \
  --organization=${ORG_ID}

# Link billing
gcloud billing projects link ${PROJECT_ID} \
  --billing-account=${BILLING_ACCOUNT}

# Set as current project
gcloud config set project ${PROJECT_ID}
```

### Step 2: Enable Required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  parametermanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  compute.googleapis.com \
  monitoring.googleapis.com \
  logging.googleapis.com
```

### Step 3: Create Service Account

```bash
# Create service account
gcloud iam service-accounts create crema-runner-sa \
  --display-name="CREMA Runner Service Account"

export CREMA_SA="crema-runner-sa@${PROJECT_ID}.iam.gserviceaccount.com"

# Grant required roles
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${CREMA_SA}" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${CREMA_SA}" \
  --role="roles/parametermanager.parameterViewer"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${CREMA_SA}" \
  --role="roles/monitoring.metricWriter"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${CREMA_SA}" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${CREMA_SA}" \
  --role="roles/run.developer"
```

### Step 4: Create GitHub Personal Access Token

Create a **fine-grained PAT** at https://github.com/settings/tokens?type=beta

**Settings:**

- Token name: `gcp-self-hosted-runners`
- Expiration: 90 days (or custom)
- Resource owner: `promptfoo`
- Repository access: `promptfoo/promptfoo` only
- Permissions:
  - **Repository permissions:**
    - Actions: Read and write
    - Administration: Read and write
    - Metadata: Read (auto-selected)

```bash
# Store token in Secret Manager
echo -n "ghp_YOUR_TOKEN_HERE" | \
  gcloud secrets create github-runner-token --data-file=-

# Verify
gcloud secrets versions access latest --secret=github-runner-token
```

### Step 5: Create Artifact Registry Repository

```bash
gcloud artifacts repositories create github-runners \
  --repository-format=docker \
  --location=${REGION} \
  --description="GitHub Actions runner images"
```

---

## Custom Runner Image

### Dockerfile

Create `infra/gcp-runners/Dockerfile`:

```dockerfile
FROM ghcr.io/actions/actions-runner:2.321.0

USER root

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    git \
    jq \
    unzip \
    build-essential \
    libssl-dev \
    zlib1g-dev \
    libbz2-dev \
    libreadline-dev \
    libsqlite3-dev \
    libffi-dev \
    liblzma-dev \
    && rm -rf /var/lib/apt/lists/*

# Install nvm and multiple Node.js versions
ENV NVM_DIR=/usr/local/nvm
ENV NODE_VERSION_20=20.20.0
ENV NODE_VERSION_22=22.22.0
ENV NODE_VERSION_24=24.0.0

RUN mkdir -p ${NVM_DIR} && \
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash && \
    . "${NVM_DIR}/nvm.sh" && \
    nvm install ${NODE_VERSION_20} && \
    nvm install ${NODE_VERSION_22} && \
    nvm install ${NODE_VERSION_24} && \
    nvm alias default ${NODE_VERSION_20} && \
    nvm use default && \
    npm install -g npm@latest

# Install pyenv and multiple Python versions
ENV PYENV_ROOT=/usr/local/pyenv
ENV PATH="${PYENV_ROOT}/shims:${PYENV_ROOT}/bin:${PATH}"

RUN curl https://pyenv.run | bash && \
    pyenv install 3.9.21 && \
    pyenv install 3.14.0a4 && \
    pyenv global 3.14.0a4

# Install Python packages
RUN pip install --no-cache-dir ruff pytest

# Install rbenv and multiple Ruby versions
ENV RBENV_ROOT=/usr/local/rbenv
ENV PATH="${RBENV_ROOT}/shims:${RBENV_ROOT}/bin:${PATH}"

RUN git clone https://github.com/rbenv/rbenv.git ${RBENV_ROOT} && \
    git clone https://github.com/rbenv/ruby-build.git ${RBENV_ROOT}/plugins/ruby-build && \
    ${RBENV_ROOT}/bin/rbenv install 3.0.7 && \
    ${RBENV_ROOT}/bin/rbenv install 3.4.1 && \
    ${RBENV_ROOT}/bin/rbenv install 4.0.1 && \
    ${RBENV_ROOT}/bin/rbenv global 4.0.1

# Install Ruby gems
RUN gem install rubocop

# Install Go
ENV GO_VERSION=1.25.6
RUN wget -q https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz && \
    tar -C /usr/local -xzf go${GO_VERSION}.linux-amd64.tar.gz && \
    rm go${GO_VERSION}.linux-amd64.tar.gz

ENV PATH="${PATH}:/usr/local/go/bin"
ENV GOPATH="/home/runner/go"
ENV PATH="${PATH}:${GOPATH}/bin"

# Install actionlint
RUN curl -sL https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash | bash && \
    mv actionlint /usr/local/bin/

# Install shfmt for shell formatting
RUN GO111MODULE=on go install mvdan.cc/sh/v3/cmd/shfmt@latest && \
    mv /root/go/bin/shfmt /usr/local/bin/

# Copy startup script
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Set ownership for runner user
RUN chown -R runner:runner ${NVM_DIR} ${PYENV_ROOT} ${RBENV_ROOT}

USER runner

# Source environment in runner's profile
RUN echo 'export NVM_DIR="/usr/local/nvm"' >> ~/.bashrc && \
    echo '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"' >> ~/.bashrc && \
    echo 'export PYENV_ROOT="/usr/local/pyenv"' >> ~/.bashrc && \
    echo 'export PATH="$PYENV_ROOT/shims:$PYENV_ROOT/bin:$PATH"' >> ~/.bashrc && \
    echo 'export RBENV_ROOT="/usr/local/rbenv"' >> ~/.bashrc && \
    echo 'export PATH="$RBENV_ROOT/shims:$RBENV_ROOT/bin:$PATH"' >> ~/.bashrc && \
    echo 'export PATH="$PATH:/usr/local/go/bin"' >> ~/.bashrc

ENTRYPOINT ["/start.sh"]
```

### Startup Script

Create `infra/gcp-runners/start.sh`:

```bash
#!/bin/bash
set -e

# Source environment
export NVM_DIR="/usr/local/nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
export PYENV_ROOT="/usr/local/pyenv"
export PATH="$PYENV_ROOT/shims:$PYENV_ROOT/bin:$PATH"
export RBENV_ROOT="/usr/local/rbenv"
export PATH="$RBENV_ROOT/shims:$RBENV_ROOT/bin:$PATH"
export PATH="$PATH:/usr/local/go/bin"

# Generate unique runner name
RUNNER_NAME="${RUNNER_PREFIX:-promptfoo}-$(hostname | cut -c1-8)-$(date +%s | tail -c 5)"
GITHUB_REPO_URL="https://github.com/${GITHUB_REPO}"

echo "=========================================="
echo "Configuring GitHub Actions Runner"
echo "Runner Name: ${RUNNER_NAME}"
echo "Repository: ${GITHUB_REPO_URL}"
echo "Labels: self-hosted,linux,x64,gcp,ubuntu-latest"
echo "=========================================="

# Configure runner
./config.sh --unattended \
  --url "${GITHUB_REPO_URL}" \
  --pat "${GITHUB_TOKEN}" \
  --name "${RUNNER_NAME}" \
  --labels "self-hosted,linux,x64,gcp,ubuntu-latest" \
  --ephemeral \
  --replace

# Cleanup function
cleanup() {
    echo "Removing runner registration..."
    ./config.sh remove --unattended --pat "${GITHUB_TOKEN}" || true
}

# Trap signals for graceful shutdown
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

# Run the runner
echo "Starting runner..."
./run.sh & wait $!
```

### Build and Push Image

```bash
# Navigate to infra directory
cd /Users/mdangelo/projects/pf2/infra/gcp-runners

# Build and push using Cloud Build
gcloud builds submit \
  --tag ${REGION}-docker.pkg.dev/${PROJECT_ID}/github-runners/promptfoo-runner:latest \
  --timeout=30m

# Tag with version for rollback capability
gcloud builds submit \
  --tag ${REGION}-docker.pkg.dev/${PROJECT_ID}/github-runners/promptfoo-runner:v1.0.0 \
  --timeout=30m
```

---

## Deploy Worker Pool

### Create Worker Pool

```bash
# Deploy worker pool with optimized settings
gcloud beta run worker-pools deploy promptfoo-linux-runners \
  --region ${REGION} \
  --image ${REGION}-docker.pkg.dev/${PROJECT_ID}/github-runners/promptfoo-runner:latest \
  --min-instances 0 \
  --max-instances 25 \
  --set-env-vars "GITHUB_REPO=${GITHUB_REPO},RUNNER_PREFIX=promptfoo" \
  --set-secrets "GITHUB_TOKEN=github-runner-token:latest" \
  --service-account ${CREMA_SA} \
  --memory 8Gi \
  --cpu 4 \
  --timeout 3600
```

**Resource Sizing Rationale:**

- **4 vCPU / 8GB RAM**: Matches GitHub-hosted runner specs (2-core with 7GB)
- **Max 25 instances**: Covers ~22 Ubuntu jobs + buffer for other workflows
- **Min 0 instances**: Scale to zero when idle (cost savings)

---

## Configure CREMA Autoscaler

### Create CREMA Configuration

Create `infra/gcp-runners/crema-config.yaml`:

```yaml
apiVersion: crema/v1
kind: CremaConfig
metadata:
  name: promptfoo-runners
spec:
  pollingInterval: 10 # Poll GitHub every 10 seconds

  triggerAuthentications:
    - metadata:
        name: github-trigger-auth
      spec:
        gcpSecretManager:
          secrets:
            - parameter: personalAccessToken
              id: github-runner-token
              version: latest

  scaledObjects:
    - spec:
        scaleTargetRef:
          name: projects/promptfoo-ci-runners/locations/us-central1/workerpools/promptfoo-linux-runners

        minReplicaCount: 0
        maxReplicaCount: 25

        triggers:
          - type: github-runner
            name: promptfoo-queue
            metadata:
              owner: promptfoo
              runnerScope: repo
              repos: promptfoo
              targetWorkflowQueueLength: 1 # 1 runner per queued job
              labels: 'self-hosted,linux,x64'
            authenticationRef:
              name: github-trigger-auth

        advanced:
          horizontalPodAutoscalerConfig:
            behavior:
              scaleDown:
                stabilizationWindowSeconds: 120 # Wait 2 min before scaling down
                policies:
                  - type: Pods
                    value: 5
                    periodSeconds: 30
              scaleUp:
                stabilizationWindowSeconds: 0 # Scale up immediately
                policies:
                  - type: Pods
                    value: 10 # Scale up 10 at a time
                    periodSeconds: 15
```

### Deploy CREMA Configuration

```bash
# Create parameter
gcloud parametermanager parameters create crema-config \
  --location=global \
  --parameter-format=YAML

# Upload configuration
gcloud parametermanager parameters versions create 1 \
  --location=global \
  --parameter=crema-config \
  --payload-data-from-file=infra/gcp-runners/crema-config.yaml
```

### Deploy CREMA Service

```bash
CREMA_CONFIG_PARAM="projects/${PROJECT_ID}/locations/global/parameters/crema-config/versions/1"

gcloud beta run deploy crema-autoscaler \
  --image=us-central1-docker.pkg.dev/cloud-run-oss-images/crema-v1/autoscaler:1.0 \
  --region=${REGION} \
  --service-account="${CREMA_SA}" \
  --no-allow-unauthenticated \
  --no-cpu-throttling \
  --min-instances=1 \
  --max-instances=1 \
  --memory=512Mi \
  --cpu=1 \
  --set-env-vars="CREMA_CONFIG=${CREMA_CONFIG_PARAM},OUTPUT_SCALER_METRICS=True"
```

---

## Workflow Migration

### Phase 1: Gradual Rollout with Feature Flag

Add repository variable for controlled rollout:

- Go to: Settings → Secrets and variables → Actions → Variables
- Create: `USE_GCP_RUNNERS` = `false` (start disabled)

### Modified main.yml

```yaml
name: CI
on:
  pull_request:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  pull-requests: read
  checks: write
  id-token: write

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

env:
  VITE_TELEMETRY_DISABLED: 1
  # Feature flag for GCP runners
  USE_GCP_RUNNERS: ${{ vars.USE_GCP_RUNNERS || 'false' }}

jobs:
  test:
    name: Test on Node ${{ matrix.node }} and ${{ matrix.os }}${{ matrix.shard && format(' (shard {0}/3)', matrix.shard) || '' }}
    timeout-minutes: 10
    runs-on: ${{ matrix.runs-on }}
    strategy:
      fail-fast: false
      matrix:
        node: ['20.20', '22.22', '24.x']
        include:
          # Ubuntu - use GCP runners when enabled
          - os: ubuntu
            node: '20.20'
            runs-on: ${{ vars.USE_GCP_RUNNERS == 'true' && fromJSON('["self-hosted", "linux", "x64", "gcp"]') || 'ubuntu-latest' }}
          - os: ubuntu
            node: '22.22'
            runs-on: ${{ vars.USE_GCP_RUNNERS == 'true' && fromJSON('["self-hosted", "linux", "x64", "gcp"]') || 'ubuntu-latest' }}
          - os: ubuntu
            node: '24.x'
            runs-on: ${{ vars.USE_GCP_RUNNERS == 'true' && fromJSON('["self-hosted", "linux", "x64", "gcp"]') || 'ubuntu-latest' }}

          # Windows - always GitHub-hosted (sharded)
          - os: windows-latest
            runs-on: windows-latest
            node: '20.20'
            shard: 1
          - os: windows-latest
            runs-on: windows-latest
            node: '20.20'
            shard: 2
          - os: windows-latest
            runs-on: windows-latest
            node: '20.20'
            shard: 3
          - os: windows-latest
            runs-on: windows-latest
            node: '22.22'
            shard: 1
          - os: windows-latest
            runs-on: windows-latest
            node: '22.22'
            shard: 2
          - os: windows-latest
            runs-on: windows-latest
            node: '22.22'
            shard: 3
          - os: windows-latest
            runs-on: windows-latest
            node: '24.x'
            shard: 1
          - os: windows-latest
            runs-on: windows-latest
            node: '24.x'
            shard: 2
          - os: windows-latest
            runs-on: windows-latest
            node: '24.x'
            shard: 3

          # macOS - always GitHub-hosted
          - os: macOS-latest
            runs-on: macos-latest
            node: '20.20'
          - os: macOS-latest
            runs-on: macos-latest
            node: '22.22'
          # macOS Node 24.x excluded due to flaky tests

    steps:
      # ... (steps remain the same)

  # All other Ubuntu jobs use the same pattern
  build:
    name: Build on Node ${{ matrix.node }}
    timeout-minutes: 5
    runs-on: ${{ vars.USE_GCP_RUNNERS == 'true' && fromJSON('["self-hosted", "linux", "x64", "gcp"]') || 'ubuntu-latest' }}
    # ... rest of job

  style-check:
    name: Style Check
    timeout-minutes: 5
    runs-on: ${{ vars.USE_GCP_RUNNERS == 'true' && fromJSON('["self-hosted", "linux", "x64", "gcp"]') || 'ubuntu-latest' }}
    # ... rest of job

  # Apply same pattern to all other Ubuntu jobs:
  # - shell-format
  # - assets
  # - python
  # - docs
  # - code-scan-action
  # - site-tests
  # - webui
  # - integration-tests
  # - smoke-tests
  # - share-test
  # - redteam
  # - redteam-staging
  # - actionlint
  # - ruby
  # - golang
```

### Simplified Alternative: Reusable Runner Selection

Add to workflow:

```yaml
env:
  UBUNTU_RUNNER: ${{ vars.USE_GCP_RUNNERS == 'true' && 'self-hosted,linux,x64,gcp' || 'ubuntu-latest' }}

jobs:
  style-check:
    runs-on: ${{ fromJSON(format('["{0}"]', env.UBUNTU_RUNNER)) }}
```

---

## Verification and Testing

### Step 1: Verify Runner Registration

After deploying, check GitHub:

1. Go to https://github.com/promptfoo/promptfoo/settings/actions/runners
2. Verify runners appear with labels: `self-hosted`, `linux`, `x64`, `gcp`

### Step 2: Test with Single Job

Create a test workflow `.github/workflows/test-gcp-runner.yml`:

```yaml
name: Test GCP Runner
on: workflow_dispatch

jobs:
  test-runner:
    runs-on: [self-hosted, linux, x64, gcp]
    steps:
      - uses: actions/checkout@v6

      - name: Check environment
        run: |
          echo "=== Node.js ==="
          node --version
          npm --version

          echo "=== Python ==="
          python --version
          pip --version

          echo "=== Ruby ==="
          ruby --version
          gem --version

          echo "=== Go ==="
          go version

          echo "=== System ==="
          uname -a
          cat /etc/os-release

      - name: Run quick test
        run: |
          npm ci
          npm run lint:src -- --max-warnings=999
```

### Step 3: Enable for Main CI

1. Set `USE_GCP_RUNNERS=true` in repository variables
2. Monitor first few PRs closely
3. Check Cloud Run logs for issues

---

## Monitoring and Alerting

### Cloud Monitoring Dashboard

```bash
# Create dashboard (or use Console)
gcloud monitoring dashboards create --config-from-file=infra/gcp-runners/dashboard.json
```

**Key Metrics:**

- `run.googleapis.com/worker_pool/instance_count` - Active runners
- `run.googleapis.com/worker_pool/billable_instance_time` - Cost tracking
- `run.googleapis.com/worker_pool/request_latencies` - Job pickup time

### Alert Policy

Create alert for runner saturation:

```bash
gcloud alpha monitoring policies create \
  --display-name="GCP Runners at Max Capacity" \
  --condition-display-name="Runners saturated" \
  --condition-filter='metric.type="run.googleapis.com/worker_pool/instance_count" resource.type="cloud_run_worker_pool"' \
  --condition-threshold-value=23 \
  --condition-threshold-comparison=COMPARISON_GE \
  --condition-threshold-duration=300s \
  --notification-channels=CHANNEL_ID
```

---

## Cost Estimation

### Current GitHub Actions (Ubuntu only)

| Metric                  | Value     |
| ----------------------- | --------- |
| Ubuntu jobs per PR      | ~22       |
| Average job duration    | ~6 min    |
| PRs per month           | ~50       |
| Push to main per month  | ~100      |
| **Total minutes/month** | ~13,200   |
| **Cost @ $0.008/min**   | **~$106** |

### GCP Self-Hosted (Estimated)

| Resource                  | Usage     | Rate                           | Monthly Cost |
| ------------------------- | --------- | ------------------------------ | ------------ |
| Worker Pool (4 vCPU, 8GB) | ~150 hrs  | $0.088/vCPU-hr + $0.0094/GB-hr | ~$65         |
| CREMA Service (always-on) | 730 hrs   | $0.024/hr                      | ~$18         |
| Artifact Registry         | 5 GB      | $0.10/GB                       | $0.50        |
| Secret Manager            | 5 secrets | $0.03/active version           | $0.15        |
| Network egress            | 30 GB     | $0.12/GB                       | $3.60        |
| **Total**                 |           |                                | **~$87**     |

### Savings

- **Before:** $106/month (GitHub Ubuntu runners)
- **After:** $87/month (GCP self-hosted)
- **Savings:** ~$19/month (18%)

**Note:** Greater savings possible with:

- Spot/preemptible instances (60-90% discount)
- Committed use discounts
- Optimizing runner specs based on actual usage

---

## Rollback Plan

### Immediate Rollback

```bash
# Disable GCP runners instantly
# Go to: Settings → Secrets and variables → Actions → Variables
# Set: USE_GCP_RUNNERS = false

# All jobs revert to ubuntu-latest immediately
```

### Emergency: Stop All GCP Runners

```bash
# Scale worker pool to zero
gcloud beta run worker-pools update promptfoo-linux-runners \
  --region=${REGION} \
  --max-instances=0

# Stop CREMA autoscaler
gcloud run services update crema-autoscaler \
  --region=${REGION} \
  --min-instances=0 \
  --max-instances=0
```

### Full Cleanup

```bash
# Delete worker pool
gcloud beta run worker-pools delete promptfoo-linux-runners \
  --region=${REGION}

# Delete CREMA service
gcloud run services delete crema-autoscaler \
  --region=${REGION}

# Delete secrets and parameters
gcloud secrets delete github-runner-token
gcloud parametermanager parameters delete crema-config --location=global

# Delete Artifact Registry repo
gcloud artifacts repositories delete github-runners \
  --location=${REGION}

# Delete project (nuclear option)
gcloud projects delete ${PROJECT_ID}
```

---

## Implementation Checklist

### Phase 1: Infrastructure (Day 1)

- [ ] Create GCP project `promptfoo-ci-runners`
- [ ] Link billing account
- [ ] Enable required APIs
- [ ] Create service account with IAM roles
- [ ] Create GitHub fine-grained PAT
- [ ] Store PAT in Secret Manager
- [ ] Create Artifact Registry repository

### Phase 2: Runner Image (Day 1-2)

- [ ] Create `infra/gcp-runners/` directory
- [ ] Create Dockerfile with all dependencies
- [ ] Create start.sh startup script
- [ ] Build and push image to Artifact Registry
- [ ] Test image locally with Docker (optional)

### Phase 3: Worker Pool & CREMA (Day 2)

- [ ] Deploy Cloud Run Worker Pool
- [ ] Create CREMA configuration YAML
- [ ] Upload config to Parameter Manager
- [ ] Deploy CREMA autoscaler service
- [ ] Verify runners appear in GitHub settings

### Phase 4: Testing (Day 2-3)

- [ ] Create test workflow for manual trigger
- [ ] Run test workflow, verify all tools work
- [ ] Fix any issues with runner image
- [ ] Re-build and redeploy if needed

### Phase 5: Gradual Rollout (Day 3-5)

- [ ] Update main.yml with feature flag support
- [ ] Create `USE_GCP_RUNNERS` repository variable (false)
- [ ] Merge workflow changes
- [ ] Enable flag (`true`) on test branch first
- [ ] Monitor test branch PRs
- [ ] Enable for main branch
- [ ] Monitor for 1 week

### Phase 6: Full Migration (Week 2)

- [ ] Update remaining workflows (docker, release-please, etc.)
- [ ] Set up monitoring dashboard
- [ ] Create alerting policies
- [ ] Document runbook for on-call
- [ ] Remove feature flag, make GCP default

---

## Security Considerations

1. **GitHub PAT Security**
   - Use fine-grained PAT with minimal scope
   - Set expiration (90 days recommended)
   - Rotate before expiration
   - Store only in Secret Manager

2. **Network Security**
   - Consider VPC connector for private networking
   - Restrict egress if needed

3. **Runner Isolation**
   - Ephemeral runners (destroyed after each job)
   - Fresh environment for every job
   - No persistent state between jobs

4. **Image Updates**
   - Schedule monthly image rebuilds
   - Pin base image versions
   - Scan images for vulnerabilities

---

## Maintenance Tasks

### Monthly

- [ ] Update runner base image
- [ ] Update tool versions (Node, Python, Ruby, Go)
- [ ] Review and rotate GitHub PAT
- [ ] Review cost reports

### Quarterly

- [ ] Audit IAM permissions
- [ ] Review scaling parameters
- [ ] Evaluate runner specs vs actual usage
- [ ] Update CREMA configuration if needed

---

## References

- [Cloud Run Worker Pools](https://cloud.google.com/run/docs/worker-pools)
- [CREMA Documentation](https://cloud.google.com/run/docs/tutorials/github-runners-crema)
- [GitHub Self-Hosted Runners](https://docs.github.com/en/actions/hosting-your-own-runners)
- [actions/runner Container](https://github.com/actions/runner/pkgs/container/actions-runner)
