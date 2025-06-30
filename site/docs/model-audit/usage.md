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

Start with these fundamental commands to scan models from various sources:

```bash
# Scan local models
promptfoo scan-model ./model.pkl
promptfoo scan-model ./models/

# Remote model scanning (preferred order)
promptfoo scan-model hf://microsoft/resnet-50               # HuggingFace
promptfoo scan-model s3://my-bucket/model.pt                # Cloud storage
promptfoo scan-model https://company.jfrog.io/.../model.pkl # JFrog
promptfoo scan-model model.pkl.dvc                          # DVC
promptfoo scan-model models:/MyModel/1                       # MLflow
```

## Remote Model Scanning

Expand beyond local files by connecting to external model repositories and storage systems.

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

Expand your scanning capabilities to cloud-hosted models with automatic authentication.

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

Automatically resolves DVC (Data Version Control) pointer files to scan the actual model files they reference.

```bash
# Scan DVC-tracked models (auto-resolves)
promptfoo scan-model model.pkl.dvc
promptfoo scan-model ./models/  # Scans all .dvc files
```

### MLflow Registry

Connect directly to MLflow model registries to scan versioned models without manual downloads.

```bash
export MLFLOW_TRACKING_URI=http://mlflow-server:5000
promptfoo scan-model models:/MyModel/1
promptfoo scan-model models:/fraud-detection/Production

# With custom registry
promptfoo scan-model models:/MyModel/Latest --registry-uri https://mlflow.company.com
```

## CLI Options

Configure ModelAudit's behavior using command-line options for different scanning scenarios.

### Complete Options Reference

| Option              | Description                                                | Default   |
| ------------------- | ---------------------------------------------------------- | --------- |
| `--blacklist`, `-b` | Additional blacklist patterns to check against model names | -         |
| `--format`, `-f`    | Output format (`text` or `json`)                           | `text`    |
| `--output`, `-o`    | Output file path (prints to stdout if not specified)       | stdout    |
| `--timeout`, `-t`   | Scan timeout in seconds                                    | `300`     |
| `--verbose`, `-v`   | Enable verbose output                                      | `false`   |
| `--max-file-size`   | Maximum file size to scan in bytes                         | unlimited |
| `--max-total-size`  | Maximum total bytes to scan before stopping                | unlimited |
| `--sbom`            | Generate Software Bill of Materials (SBOM) file            | -         |
| `--registry-uri`    | MLflow registry URI for models:// scanning                 | -         |
| `--jfrog-api-token` | JFrog Artifactory API token                                | -         |

### Usage Examples

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

Access ModelAudit's visual interface for an interactive scanning experience.

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

ModelAudit includes multiple layers of security protection to defend against sophisticated attacks:

- **File Type Validation**: Detects spoofed file extensions and format mismatches
- **Resource Protection**: Prevents zip bombs, memory exhaustion, and DoS attacks
- **Path Traversal Prevention**: Blocks malicious archive extractions that attempt to write files outside their intended directory
- **Executable Detection**: Finds embedded PE, ELF, and Mach-O files with validation

## Blacklist Configuration

Configure custom security patterns to detect specific threats relevant to your organization.

### Using Blacklist Patterns

Add custom patterns to flag suspicious model names or content:

```bash
# Single pattern
promptfoo scan-model model.pkl --blacklist "unsafe_model"

# Multiple patterns
promptfoo scan-model model.pkl --blacklist "unsafe_model" --blacklist "malicious_net" --blacklist "backdoor"

# Pattern examples for different threats
promptfoo scan-model models/ \
  --blacklist "deepfake" \
  --blacklist "jailbreak" \
  --blacklist "bypass" \
  --blacklist "exploit"
```

### Common Blacklist Patterns

**Malicious model names:**

```bash
--blacklist "unsafe_.*" --blacklist "malicious.*" --blacklist "backdoor.*"
```

**Known vulnerable models:**

```bash
--blacklist "compromised_model" --blacklist "trojan_net" --blacklist "poison.*"
```

**Suspicious origins:**

```bash
--blacklist "unknown_source" --blacklist "untrusted.*" --blacklist "test_exploit"
```

### Pattern Matching

Blacklist patterns support basic wildcards and are case-insensitive:

- `unsafe_*` matches `unsafe_model`, `unsafe_net`, etc.
- `.*malicious.*` matches any name containing "malicious"
- Patterns are checked against model file names and paths

## CI/CD Integration

Integrate ModelAudit into your development workflows to automate security scanning.

### Exit Codes for Automation

ModelAudit returns specific exit codes for different scenarios:

- `0`: No security issues found (clean scan)
- `1`: Issues detected (warnings or critical findings)
- `2`: Scan errors (file not found, permission denied, etc.)

Use these codes to control your CI/CD pipeline behavior.

### GitHub Actions

Complete GitHub Actions workflow for model security scanning:

```yaml
# .github/workflows/model-security.yml
name: Model Security Scan

on:
  push:
    paths:
      - 'models/**'
      - '**/*.pkl'
      - '**/*.h5'
      - '**/*.pt'
      - '**/*.pth'
      - '**/*.onnx'
      - '**/*.safetensors'
  pull_request:
    paths:
      - 'models/**'

jobs:
  model-security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.10'

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install ModelAudit
        run: |
          npm install -g promptfoo
          pip install modelaudit[all]

      - name: Scan models for security issues
        run: |
          promptfoo scan-model models/ \
            --format json \
            --output scan-results.json \
            --blacklist "unsafe.*" \
            --blacklist "malicious.*" \
            --timeout 600

      - name: Check for critical security issues
        run: |
          if grep -q '"severity":"critical"' scan-results.json; then
            echo "🚨 Critical security issues found in models!"
            echo "Please review the scan results before proceeding."
            exit 1
          elif grep -q '"severity":"warning"' scan-results.json; then
            echo "⚠️ Security warnings found in models."
            echo "Review recommended but not blocking deployment."
          else
            echo "✅ No security issues found in models."
          fi

      - name: Upload scan results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: model-security-scan-results
          path: scan-results.json

      - name: Comment PR with results
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('scan-results.json', 'utf8'));
            const criticalCount = results.filter(r => r.severity === 'critical').length;
            const warningCount = results.filter(r => r.severity === 'warning').length;

            let message = '## 🔍 Model Security Scan Results\n\n';
            if (criticalCount > 0) {
              message += `🚨 **${criticalCount} critical security issues found**\n`;
            }
            if (warningCount > 0) {
              message += `⚠️ **${warningCount} warnings found**\n`;
            }
            if (criticalCount === 0 && warningCount === 0) {
              message += '✅ **No security issues detected**\n';
            }

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: message
            });
```

### GitLab CI

GitLab CI configuration for model security scanning:

```yaml
# .gitlab-ci.yml
stages:
  - security-scan

model-security-scan:
  stage: security-scan
  image: node:18
  before_script:
    - apt-get update && apt-get install -y python3 python3-pip
    - npm install -g promptfoo
    - pip3 install modelaudit[all]
  script:
    - |
      promptfoo scan-model models/ \
        --format json \
        --output scan-results.json \
        --blacklist "unsafe.*" \
        --blacklist "malicious.*" \
        --timeout 600
    - |
      if grep -q '"severity":"critical"' scan-results.json; then
        echo "🚨 Critical security issues found!"
        cat scan-results.json
        exit 1
      fi
  artifacts:
    reports:
      junit: scan-results.json
    paths:
      - scan-results.json
    when: always
    expire_in: 1 week
  only:
    changes:
      - models/**/*
      - '**/*.pkl'
      - '**/*.h5'
      - '**/*.pt'
      - '**/*.pth'
      - '**/*.onnx'
```

### Pre-commit Hook

Add ModelAudit as a pre-commit hook to catch issues early:

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: modelaudit-scan
        name: ModelAudit Security Scan
        entry: promptfoo scan-model
        language: system
        files: '\.(pkl|h5|pb|pt|pth|keras|hdf5|onnx|safetensors|bin|tflite|msgpack|pmml|joblib|npy|gguf|ggml)$'
        args: ['--blacklist', 'unsafe.*', '--blacklist', 'malicious.*']
        pass_filenames: true
        stages: [commit]
```

Install and use:

```bash
pip install pre-commit
pre-commit install
# Now scans run automatically on git commit
```

### Jenkins Pipeline

Jenkins pipeline configuration:

````groovy
pipeline {
    agent any

    stages {
        stage('Model Security Scan') {
            when {
                anyOf {
                    changeset 'models/**'
                    changeset '**/*.pkl'
                    changeset '**/*.h5'
                    changeset '**/*.pt'
                    changeset '**/*.onnx'
                }
            }
            steps {
                script {
                    sh '''
                        npm install -g promptfoo
                        pip install modelaudit[all]

                        promptfoo scan-model models/ \
                            --format json \
                            --output scan-results.json \
                            --blacklist "unsafe.*" \
                            --blacklist "malicious.*"

                        if grep -q '"severity":"critical"' scan-results.json; then
                            echo "Critical security issues found!"
                            exit 1
                        fi
                    '''
                }
            }
            post {
                always {
                    archiveArtifacts artifacts: 'scan-results.json', allowEmptyArchive: true
                }
            }
        }
    }
}

## Troubleshooting

Resolve common issues that may occur during installation or scanning.

**Missing dependencies:**

```bash
pip install tensorflow h5py torch onnx  # Install format-specific dependencies
````

**File size limits:**

```bash
promptfoo scan-model model.pkl --max-file-size 3221225472  # 3GB limit
```

**Timeout issues:**

```bash
promptfoo scan-model model.pkl --timeout 600  # 10 minute timeout
```

## Configuration Files

For complex scanning requirements, create a YAML configuration file to customize scanner behavior.

### Basic Configuration

```yaml
# modelaudit-config.yaml
blacklist_patterns:
  - 'unsafe_model'
  - 'malicious_net'
  - 'backdoor.*'

max_file_size: 1073741824 # 1GB
timeout: 600 # 10 minutes
```

### Advanced Scanner Configuration

```yaml
scanners:
  pickle:
    max_opcodes: 2000000
    suspicious_globals:
      - 'os.*'
      - 'subprocess.*'
      - 'builtins.eval'
      - 'importlib.*'

  tensorflow:
    suspicious_ops:
      - 'ReadFile'
      - 'WriteFile'
      - 'PyFunc'
      - 'ShellExecute'

  keras:
    suspicious_layer_types:
      - 'Lambda'
      - 'TFOpLambda'
      - 'PyFunc'

  zip:
    max_zip_depth: 5
    max_zip_entries: 10000
    max_entry_size: 10485760 # 10MB

  weight_distribution:
    z_score_threshold: 3.0
    cosine_similarity_threshold: 0.7
    weight_magnitude_threshold: 3.0

  numpy:
    max_array_bytes: 1073741824 # 1GB
    max_dimensions: 32
    max_itemsize: 1024
```

### Using Configuration Files

```bash
# With standalone ModelAudit
modelaudit scan --config modelaudit-config.yaml path/to/models/

# Note: Configuration files are not yet supported with promptfoo CLI wrapper
# Use CLI options instead:
promptfoo scan-model --blacklist "unsafe_model" --timeout 600 path/to/models/
```

## Programmatic Usage (Python API)

Use ModelAudit programmatically in your Python applications for custom integrations.

### Basic Usage

```python
from modelaudit.core import scan_model_directory_or_file

# Scan a single model
results = scan_model_directory_or_file("path/to/model.pkl")

# Check for issues
if results["issues"]:
    print(f"Found {len(results['issues'])} issues:")
    for issue in results["issues"]:
        print(f"- {issue['severity'].upper()}: {issue['message']}")
else:
    print("No issues found!")
```

### Advanced Usage

```python
# Scan HuggingFace models
results = scan_model_directory_or_file("https://huggingface.co/bert-base-uncased")

# Custom configuration
config = {
    "blacklist_patterns": ["unsafe_model", "malicious_net"],
    "max_file_size": 1073741824,  # 1GB
    "timeout": 600  # 10 minutes
}
results = scan_model_directory_or_file("path/to/models/", **config)

# Scan multiple sources
sources = [
    "local_model.pkl",
    "https://hf.co/gpt2",
    "hf://microsoft/resnet-50",
    "./models/"
]

for source in sources:
    results = scan_model_directory_or_file(source)
    print(f"Scanning {source}: {len(results['issues'])} issues found")
```

### Processing Results

```python
# Extract specific severity issues
critical_issues = [i for i in results["issues"] if i["severity"] == "critical"]
warnings = [i for i in results["issues"] if i["severity"] == "warning"]

# Export results
import json
with open("scan-results.json", "w") as f:
    json.dump(results, f, indent=2)
```
