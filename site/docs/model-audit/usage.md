---
title: Usage Guide
description: ModelAudit CLI options, remote scanning, and integrations.
keywords: [modelaudit usage, CLI options, cloud integration, MLflow, CI/CD security scanning]
sidebar_label: Usage
sidebar_position: 3
---

# Usage Guide

Complete reference for ModelAudit CLI options and integrations.

## Basic Usage

```bash
# Local scanning
promptfoo scan-model ./model.pkl
promptfoo scan-model ./models/

# Remote scanning
promptfoo scan-model hf://microsoft/resnet-50
promptfoo scan-model s3://my-bucket/model.pt
promptfoo scan-model models:/MyModel/1
```

## CLI Options

| Option              | Description                         | Default   |
| ------------------- | ----------------------------------- | --------- |
| `--format`, `-f`    | Output format (`text` or `json`)    | `text`    |
| `--output`, `-o`    | Output file path                    | stdout    |
| `--blacklist`, `-b` | Additional blacklist patterns       | -         |
| `--timeout`, `-t`   | Scan timeout in seconds             | `300`     |
| `--verbose`, `-v`   | Enable verbose output               | `false`   |
| `--max-file-size`   | Maximum file size to scan           | unlimited |
| `--sbom`            | Generate Software Bill of Materials | -         |

### Common Examples

```bash
# Export results
promptfoo scan-model model.pkl --format json --output results.json

# Add security patterns
promptfoo scan-model model.pkl --blacklist "unsafe_.*" --blacklist "backdoor.*"

# Set resource limits
promptfoo scan-model models/ --max-file-size 1073741824 --timeout 600
```

## Remote Model Scanning

### HuggingFace

```bash
# Public models
promptfoo scan-model hf://microsoft/resnet-50
promptfoo scan-model https://huggingface.co/bert-base-uncased

# Private models
export HF_TOKEN=your_token_here
promptfoo scan-model hf://your-org/private-model
```

### Cloud Storage

<details>
<summary>AWS S3</summary>

```bash
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
promptfoo scan-model s3://my-bucket/model.pt
```

</details>

<details>
<summary>Google Cloud Storage</summary>

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
promptfoo scan-model gs://my-bucket/model.h5
```

</details>

<details>
<summary>Cloudflare R2</summary>

```bash
export AWS_ENDPOINT_URL=https://account.r2.cloudflarestorage.com
promptfoo scan-model r2://my-bucket/model.safetensors
```

</details>

### Model Registries

**MLflow:**

```bash
export MLFLOW_TRACKING_URI=http://mlflow-server:5000
promptfoo scan-model models:/MyModel/1
promptfoo scan-model models:/MyModel/Latest --registry-uri https://mlflow.company.com
```

**JFrog Artifactory:**

```bash
export JFROG_API_TOKEN=your_token
promptfoo scan-model https://company.jfrog.io/artifactory/models/model.pkl
```

**DVC (auto-resolves):**

```bash
promptfoo scan-model model.pkl.dvc
```

## Blacklist Configuration

Configure custom security patterns:

```bash
# Common patterns
promptfoo scan-model model.pkl \
  --blacklist "unsafe_.*" \
  --blacklist "backdoor.*" \
  --blacklist "trojan.*" \
  --blacklist "exploit.*"
```

Pattern matching:

- `unsafe_*` matches `unsafe_model`, `unsafe_net`, etc.
- `.*malicious.*` matches any name containing "malicious"
- Case-insensitive matching

## CI/CD Integration

### GitHub Actions

```yaml
name: Model Security Scan
on:
  push:
    paths: ['models/**', '**/*.pkl', '**/*.h5', '**/*.pt']

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup
        run: |
          npm install -g promptfoo
          pip install modelaudit[all]

      - name: Scan Models
        run: |
          promptfoo scan-model models/ \
            --format json \
            --output results.json \
            --blacklist "unsafe.*"

      - name: Check Results
        run: |
          if grep -q '"severity":"critical"' results.json; then
            echo "🚨 Critical security issues found!"
            exit 1
          fi

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: scan-results
          path: results.json
```

[View full CI/CD examples →](https://github.com/promptfoo/modelaudit-examples)

### Exit Codes

- `0`: Clean scan (no issues)
- `1`: Issues found (review needed)
- `2`: Scan error (file not found, etc.)

## Web Interface

Visual scanning interface with progress tracking:

```bash
promptfoo view
# Navigate to http://localhost:15500/model-audit
```

## Advanced Configuration

### Configuration File

```yaml
# modelaudit-config.yaml
blacklist_patterns:
  - 'unsafe_model'
  - 'backdoor.*'

max_file_size: 1073741824 # 1GB
timeout: 600 # 10 minutes

scanners:
  pickle:
    max_opcodes: 2000000
  tensorflow:
    suspicious_ops: ['ReadFile', 'WriteFile', 'PyFunc']
  zip:
    max_zip_depth: 5
    max_entry_size: 10485760 # 10MB
```

Use with:

```bash
modelaudit scan --config modelaudit-config.yaml models/
```

### Python API

Basic usage:

```python
from modelaudit.core import scan_model_directory_or_file

# Scan model
results = scan_model_directory_or_file("model.pkl")

# Check results
if results["issues"]:
    for issue in results["issues"]:
        print(f"{issue['severity']}: {issue['message']}")
```

[Full API documentation →](https://docs.promptfoo.dev/docs/model-audit/api)

## Security Features

- **File Type Validation**: Detects spoofed extensions
- **Resource Protection**: Prevents zip bombs and memory exhaustion
- **Path Traversal Prevention**: Blocks malicious archive extractions
- **Executable Detection**: Finds embedded PE, ELF, Mach-O files

## Troubleshooting

**Missing dependencies:**

```bash
pip install tensorflow h5py torch onnx  # Install as needed
```

**Large file timeouts:**

```bash
promptfoo scan-model large-model.pt --timeout 1200  # 20 minutes
```

**Memory issues:**

```bash
promptfoo scan-model model.pkl --max-file-size 3221225472  # 3GB limit
```

## Next Steps

- **[Scanner Reference](./scanners.md)** - Detailed scanner capabilities
- **[Examples Repository](https://github.com/promptfoo/modelaudit-examples)** - Templates and integrations
- **[API Reference](https://docs.promptfoo.dev/docs/model-audit/api)** - Python API documentation
