---
title: Usage Guide - ModelAudit CLI and Integrations
description: Complete usage guide for ModelAudit including CLI options, cloud integrations, CI/CD setup, and advanced security features.
keywords:
  [modelaudit usage, CLI options, cloud integration, MLflow, JFrog, DVC, CI/CD security scanning]
sidebar_label: Usage
sidebar_position: 3
---

# Usage Guide

Complete reference for ModelAudit CLI options, integrations, and advanced features.

:::info Installation Required
Complete the **[Installation & Quick Start Guide](./installation.md)** before using these features.
:::

## Basic Commands

```bash
# Scan local models
promptfoo scan-model ./model.pkl
promptfoo scan-model ./models/

# Remote model scanning (preferred order)
promptfoo scan-model hf://microsoft/resnet-50               # HuggingFace
promptfoo scan-model s3://my-bucket/model.pt                # Cloud storage
promptfoo scan-model https://company.jfrog.io/.../model.pkl # JFrog
promptfoo scan-model model.pkl.dvc                         # DVC
promptfoo scan-model models:/MyModel/1                      # MLflow
```

## Remote Model Scanning

### HuggingFace Models

Scan models directly from HuggingFace without manual downloads.

**Supported formats:**

```bash
promptfoo scan-model https://huggingface.co/bert-base-uncased
promptfoo scan-model hf://microsoft/resnet-50
promptfoo scan-model https://hf.co/gpt2
```

**Private models:**

```bash
export HF_TOKEN=your_token_here
promptfoo scan-model hf://your-org/private-model
```

**Dependency:** `pip install huggingface-hub`

### Cloud Storage

Scan models from cloud providers with automatic authentication.

**AWS S3:**

```bash
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
promptfoo scan-model s3://my-bucket/model.pt
```

**Google Cloud Storage:**

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
promptfoo scan-model gs://my-bucket/model.h5
```

**Cloudflare R2:**

```bash
export AWS_ENDPOINT_URL=https://account.r2.cloudflarestorage.com
promptfoo scan-model r2://my-bucket/model.safetensors
```

### JFrog Artifactory

Scan models from JFrog repositories with authentication.

**Using tokens:**

```bash
export JFROG_API_TOKEN=your_token
promptfoo scan-model https://company.jfrog.io/artifactory/models/model.pkl

# Or with CLI option
promptfoo scan-model https://company.jfrog.io/.../model.pkl --jfrog-api-token abc123
```

### DVC Integration

Automatically resolves DVC pointer files to scan actual models.

```bash
# Scan DVC-tracked models (auto-resolves)
promptfoo scan-model model.pkl.dvc
promptfoo scan-model ./models/  # Scans all .dvc files
```

### MLflow Registry

Scan models from MLflow registries.

```bash
export MLFLOW_TRACKING_URI=http://mlflow-server:5000
promptfoo scan-model models:/MyModel/1
promptfoo scan-model models:/fraud-detection/Production

# With custom registry
promptfoo scan-model models:/MyModel/Latest --registry-uri https://mlflow.company.com
```

## CLI Options

**Output Control:**

```bash
promptfoo scan-model model.pkl --format json --output results.json
promptfoo scan-model models/ --sbom compliance-report.json
promptfoo scan-model model.pkl --verbose
```

**Security Patterns:**

```bash
promptfoo scan-model model.pkl --blacklist "unsafe_pattern" --blacklist "malicious_net"
```

**Resource Limits:**

```bash
promptfoo scan-model models/ --max-file-size 1073741824 --max-total-size 5368709120 --timeout 600
```

**Authentication:**

```bash
promptfoo scan-model models:/MyModel/1 --registry-uri http://mlflow.example.com
promptfoo scan-model https://company.jfrog.io/.../model.pkl --jfrog-api-token abc123
```

## Web Interface

Access ModelAudit through Promptfoo's web interface for visual scanning:

```bash
promptfoo view
# Navigate to http://localhost:15500/model-audit
```

**Features:**

- Visual file selection and configuration
- Real-time progress tracking
- Interactive results with severity filtering
- Scan history and export options

## Security Features

ModelAudit includes advanced security protections:

- **File Type Validation**: Detects spoofed file extensions and format mismatches
- **Resource Protection**: Prevents zip bombs, memory exhaustion, and DoS attacks
- **Path Traversal Prevention**: Blocks malicious archive extractions
- **Executable Detection**: Finds embedded PE, ELF, and Mach-O files with validation

## CI/CD Integration

Use ModelAudit in your development workflows:

**Exit codes for automation:**

- `0`: No security issues found
- `1`: Issues detected (warnings or critical)
- `2`: Scan errors (file not found, etc.)

**GitHub Actions example:**

```yaml
- name: Scan models
  run: promptfoo scan-model models/ --format json --output scan-results.json
- name: Check for critical issues
  run: |
    if grep -q '"severity":"critical"' scan-results.json; then
      echo "Critical security issues found!"
      exit 1
    fi
```

## Troubleshooting

**Missing dependencies:**

```bash
pip install tensorflow h5py torch onnx  # Install format-specific dependencies
```

**File size limits:**

```bash
promptfoo scan-model model.pkl --max-file-size 3221225472  # 3GB limit
```

**Timeout issues:**

```bash
promptfoo scan-model model.pkl --timeout 600  # 10 minute timeout
```
