---
title: ModelAudit Advanced Usage
sidebar_label: Advanced Usage
sidebar_position: 120
description: Automate LLM model scanning across cloud providers with remote storage integration, CI/CD workflows, and programmatic controls for advanced security testing
keywords:
  [
    modelaudit,
    model scanning,
    cloud storage,
    remote model scanning,
    huggingface,
    s3 model scanning,
    gcs model scanning,
    mlflow,
    jfrog artifactory,
    dvc,
    model authentication,
    ci cd integration,
    github actions,
    gitlab ci,
    programmatic scanning,
    sarif output,
    sbom generation,
    custom scanners,
    model security automation,
  ]
---

# Advanced Usage

This page covers advanced ModelAudit features including cloud storage integration, CI/CD workflows, and programmatic usage.

## Authentication and Configuration

ModelAudit uses environment variables for authentication with cloud services and model registries.

### Cloud & Artifact Registry Authentication

Authentication for all remote services is now handled exclusively via environment variables.

#### HuggingFace

- `HF_TOKEN`: Your HuggingFace Hub token for accessing private models.

```bash
# Authenticate for private models
export HF_TOKEN=your_token_here
promptfoo scan-model hf://your-org/private-model
```

#### JFrog Artifactory

- `JFROG_URL`: The base URL of your JFrog Artifactory instance.
- `JFROG_API_TOKEN` or `JFROG_ACCESS_TOKEN`: Your API or access token.

```bash
# Authenticate using an API token
export JFROG_URL="https://your-domain.jfrog.io"
export JFROG_API_TOKEN="your-api-token"
promptfoo scan-model "https://your-domain.jfrog.io/artifactory/repo/model.pkl"
```

#### MLflow Model Registry

- `MLFLOW_TRACKING_URI`: The URI of your MLflow tracking server.
- `MLFLOW_TRACKING_USERNAME` / `MLFLOW_TRACKING_PASSWORD`: Credentials for MLflow authentication.

```bash
# Authenticate with MLflow
export MLFLOW_TRACKING_URI="https://your-mlflow-server.com"
export MLFLOW_TRACKING_USERNAME="your-username"
export MLFLOW_TRACKING_PASSWORD="your-password"
promptfoo scan-model models:/model-name/version
```

#### Amazon S3

- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`: Standard AWS credentials.

```bash
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_DEFAULT_REGION="us-east-1"
promptfoo scan-model s3://my-bucket/model.pkl
```

#### Google Cloud Storage

- `GOOGLE_APPLICATION_CREDENTIALS`: Path to your service account key file.

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
promptfoo scan-model gs://my-bucket/model.pt
```

#### Cloudflare R2

- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`: Your R2 credentials.
- `AWS_ENDPOINT_URL`: The S3-compatible endpoint for your R2 account.

```bash
export AWS_ACCESS_KEY_ID="your-r2-access-key"
export AWS_SECRET_ACCESS_KEY="your-r2-secret-key"
export AWS_ENDPOINT_URL="https://your-account.r2.cloudflarestorage.com"
promptfoo scan-model r2://my-bucket/model.safetensors
```

### Migration from Deprecated Flags

The following CLI flags have been **removed** and replaced by environment variables. Attempting to use them will result in an error.

| Removed Flag           | Replacement Environment Variable     |
| ---------------------- | ------------------------------------ |
| `--jfrog-api-token`    | `JFROG_API_TOKEN`                    |
| `--jfrog-access-token` | `JFROG_ACCESS_TOKEN`                 |
| `--registry-uri`       | `JFROG_URL` or `MLFLOW_TRACKING_URI` |

**Why the change?** Using environment variables is more secure than passing secrets as CLI flags, as it prevents them from being exposed in shell history or process lists. This aligns with industry best practices for managing credentials.

## Remote Model Scanning

ModelAudit can scan models directly from various remote sources without manual downloading.

### HuggingFace

Scan public or private models from the HuggingFace Hub.

```bash
# Public model
promptfoo scan-model https://huggingface.co/bert-base-uncased

# Private model (requires HF_TOKEN to be set)
promptfoo scan-model hf://your-org/private-model
```

### Cloud Storage (S3, GCS, R2)

Scan models stored in cloud buckets. See the [Authentication](#authentication-and-configuration) section for setup.

```bash
# Scan from S3
promptfoo scan-model s3://my-bucket/model.pkl

# Scan from Google Cloud Storage
promptfoo scan-model gs://my-bucket/model.pt

# Scan from Cloudflare R2
promptfoo scan-model r2://my-bucket/model.safetensors
```

### Model Registries (MLflow, JFrog)

Scan models from MLflow or JFrog Artifactory. See the [Authentication](#authentication-and-configuration) section for setup.

```bash
# Scan from MLflow
promptfoo scan-model models:/MyModel/Latest

# Scan from JFrog Artifactory
promptfoo scan-model "https://your-domain.jfrog.io/artifactory/models/model.pkl"
```

### DVC Integration

ModelAudit automatically resolves DVC pointer files:

```bash
# Scans the actual model file referenced by the .dvc file
promptfoo scan-model model.pkl.dvc
```

## Configuration Options

ModelAudit's behavior can be customized through command-line options. While configuration files are not currently supported, you can achieve similar results using CLI flags:

```bash
# Set blacklist patterns
promptfoo scan-model models/ \
  --blacklist "deepseek" \
  --blacklist "qwen" \
  --blacklist "unsafe_model"

# Set resource limits
promptfoo scan-model models/ \
  --max-size 1GB \
  --timeout 600

# Combine multiple options
promptfoo scan-model models/ \
  --blacklist "suspicious_pattern" \
  --max-size 1GB \
  --timeout 600 \
  --verbose

# Enable strict mode for enhanced security validation
promptfoo scan-model model.pkl --strict

# Strict mode with additional output options
promptfoo scan-model models/ \
  --strict \
  --format sarif \
  --output security-scan.sarif
```

### Scanner Selection

ModelAudit allows you to selectively run specific scanners or use predefined scanner profiles. This enables targeted scanning aligned with specific threat categories, faster feedback loops, and improved resource efficiency.

#### Including or Excluding Scanners

Use `--include-scanner` or `--exclude-scanner` for fine-grained control over which scanners run:

```bash
# Include specific scanners (adds to default set)
promptfoo scan-model models/ --include-scanner PickleScanner H5Scanner

# Exclude specific scanners from running
promptfoo scan-model models/ --exclude-scanner WeightDistributionScanner

# Combine both - add some, remove others
promptfoo scan-model models/ \
  --include-scanner PickleScanner \
  --exclude-scanner WeightDistributionScanner
```

#### Scanner Profiles

Use predefined scanner profiles for common scanning scenarios:

```bash
# Quick scan - runs essential security checks only
promptfoo scan-model models/ --profile quick-scan

# Focus on serialization attacks (pickle, torch, etc.)
promptfoo scan-model models/ --profile serialization-attacks

# Verify model file format integrity
promptfoo scan-model models/ --profile format-integrity

# Inspect archive-based model formats (zip, tar)
promptfoo scan-model models/ --profile archive-inspection

# Scan for secrets, API keys, and network threats
promptfoo scan-model models/ --profile secrets-network-threats

# Analyze model behavior and weight patterns
promptfoo scan-model models/ --profile model-behavior

# Run all available scanners (default)
promptfoo scan-model models/ --profile full-audit
```

#### Combining Scanner Selection Options

You can combine scanner selection options with other ModelAudit features:

```bash
# Quick scan with JSON output
promptfoo scan-model models/ --profile quick-scan --format json --output results.json

# Include specific scanners with custom resource limits
promptfoo scan-model models/ \
  --include-scanner PickleScanner TensorflowSavedModelScanner \
  --max-size 1GB \
  --timeout 300 \
  --verbose

# Exclude scanner from a profile-based scan
promptfoo scan-model models/ \
  --profile serialization-attacks \
  --exclude-scanner WeightDistributionScanner
```

#### Use Cases for Scanner Selection

Scanner selection is particularly useful for:

- **CI/CD Integration**: Run quick scans on pull requests and comprehensive scans on merges
- **Risk Prioritization**: Focus on high-severity vulnerability scanners first
- **Threat Modeling**: Align scans with specific threat categories relevant to your deployment
- **Performance Optimization**: Reduce scan time by running only relevant scanners
- **Incident Response**: Run targeted forensic scans when investigating specific threats

For a complete list of available scanners and their capabilities, see the [Scanners documentation](/docs/model-audit/scanners).

### Sharing Results

When connected to promptfoo Cloud, model audit results are automatically shared by default. This provides a web-based interface to view, analyze, and collaborate on scan results.

```bash
# Results are automatically shared when cloud is enabled
promptfoo scan-model models/

# Explicitly enable sharing
promptfoo scan-model models/ --share

# Disable sharing for this scan
promptfoo scan-model models/ --no-share

# Disable sharing globally via environment variable
export PROMPTFOO_DISABLE_SHARING=true
promptfoo scan-model models/
```

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/model-security.yml
name: Model Security Scan

on:
  push:
    paths:
      - 'models/**'
      - '**.pkl'
      - '**.h5'
      - '**.pb'
      - '**.pt'
      - '**.pth'

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.10'

      - name: Install dependencies
        run: |
          npm install -g promptfoo
          pip install modelaudit[all]

      - name: Scan models
        run: promptfoo scan-model models/ --format sarif --output model-scan.sarif

      - name: Upload SARIF to GitHub Advanced Security
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: model-scan.sarif
          category: model-security

      - name: Upload scan results as artifact
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: model-scan-results
          path: model-scan.sarif
```

### GitLab CI

```yaml
# .gitlab-ci.yml
model_security_scan:
  stage: test
  image: python:3.10
  script:
    - pip install modelaudit[all]
    - npm install -g promptfoo
    - promptfoo scan-model models/ --format json --output scan-results.json
    - if grep -q '"severity":"critical"' scan-results.json; then echo "Critical security issues found!"; exit 1; fi
  artifacts:
    paths:
      - scan-results.json
    when: always
  only:
    changes:
      - models/**
      - '**/*.pkl'
      - '**/*.h5'
      - '**/*.pb'
      - '**/*.pt'
      - '**/*.pth'
```

### Pre-commit Hook

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: modelaudit
        name: ModelAudit
        entry: promptfoo scan-model
        language: system
        files: '\.(pkl|h5|pb|pt|pth|keras|hdf5|json|yaml|yml|zip|onnx|safetensors|bin|tflite|msgpack|pmml|joblib|npy|gguf|ggml)$'
        pass_filenames: true
```

## Programmatic Usage

You can use ModelAudit programmatically in your Python code:

```python
from modelaudit.core import scan_model_directory_or_file

# Scan a single model
results = scan_model_directory_or_file("path/to/model.pkl")

# Scan a HuggingFace model URL
results = scan_model_directory_or_file("https://huggingface.co/bert-base-uncased")

# Check for issues
if results["issues"]:
    print(f"Found {len(results['issues'])} issues:")
    for issue in results["issues"]:
        print(f"- {issue['severity'].upper()}: {issue['message']}")
else:
    print("No issues found!")

# Scan with custom configuration
config = {
    "blacklist_patterns": ["unsafe_model", "malicious_net"],
    "max_file_size": 1073741824,  # 1GB
    "timeout": 600  # 10 minutes
}

results = scan_model_directory_or_file("path/to/models/", **config)
```

## JSON Output Format

When using `--format json`, ModelAudit outputs structured results:

```json
{
  "scanner_names": ["pickle"],
  "start_time": 1750168822.481906,
  "bytes_scanned": 74,
  "issues": [
    {
      "message": "Found REDUCE opcode - potential __reduce__ method execution",
      "severity": "warning",
      "location": "evil.pickle (pos 71)",
      "details": {
        "position": 71,
        "opcode": "REDUCE"
      },
      "timestamp": 1750168822.482304
    },
    {
      "message": "Suspicious module reference found: posix.system",
      "severity": "critical",
      "location": "evil.pickle (pos 28)",
      "details": {
        "module": "posix",
        "function": "system",
        "position": 28,
        "opcode": "STACK_GLOBAL"
      },
      "timestamp": 1750168822.482378,
      "why": "The 'os' module provides direct access to operating system functions."
    }
  ],
  "has_errors": false,
  "files_scanned": 1,
  "duration": 0.0005328655242919922,
  "assets": [
    {
      "path": "evil.pickle",
      "type": "pickle"
    }
  ]
}
```

## SARIF Output Format

ModelAudit supports SARIF (Static Analysis Results Interchange Format) 2.1.0 output for seamless integration with security tools and CI/CD pipelines:

```bash
# Output SARIF to stdout
promptfoo scan-model model.pkl --format sarif

# Save SARIF to file
promptfoo scan-model model.pkl --format sarif --output results.sarif

# Scan multiple models with SARIF output
promptfoo scan-model models/ --format sarif --output scan-results.sarif
```

### SARIF Structure

The SARIF output includes:

- **Rules**: Unique security patterns detected (e.g., pickle issues, dangerous imports)
- **Results**: Individual findings with severity levels, locations, and fingerprints
- **Artifacts**: Information about scanned files including hashes
- **Tool Information**: ModelAudit version and capabilities
- **Invocation Details**: Command-line arguments and scan statistics

Example SARIF output structure:

```json
{
  "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
  "version": "2.1.0",
  "runs": [
    {
      "tool": {
        "driver": {
          "name": "ModelAudit",
          "version": "0.2.3",
          "rules": [
            {
              "id": "MA-PICKLE-ISSUE",
              "name": "Pickle Security Issue",
              "defaultConfiguration": {
                "level": "error",
                "rank": 90.0
              }
            }
          ]
        }
      },
      "results": [
        {
          "ruleId": "MA-PICKLE-ISSUE",
          "level": "error",
          "message": {
            "text": "Suspicious module reference found: os.system"
          },
          "locations": [
            {
              "physicalLocation": {
                "artifactLocation": {
                  "uri": "model.pkl"
                }
              }
            }
          ]
        }
      ]
    }
  ]
}
```

### Severity Mapping

ModelAudit severities are mapped to SARIF levels:

- `CRITICAL` → `error`
- `WARNING` → `warning`
- `INFO` → `note`
- `DEBUG` → `none`

### Integration with Security Tools

SARIF output enables integration with:

#### GitHub Advanced Security

```yaml
# .github/workflows/security.yml
- name: Scan models
  run: promptfoo scan-model models/ --format sarif --output model-scan.sarif

- name: Upload SARIF to GitHub
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: model-scan.sarif
    category: model-security
```

#### Azure DevOps

```yaml
# azure-pipelines.yml
- script: |
    promptfoo scan-model models/ --format sarif --output $(Build.ArtifactStagingDirectory)/model-scan.sarif
  displayName: 'Scan models'

- task: PublishSecurityAnalysisLogs@3
  inputs:
    ArtifactName: 'CodeAnalysisLogs'
    ArtifactType: 'Container'
    AllTools: false
    ToolLogsNotFoundAction: 'Standard'
```

#### VS Code SARIF Viewer

```bash
# Generate SARIF for local viewing
promptfoo scan-model . --format sarif --output scan.sarif

# Open in VS Code with SARIF Viewer extension
code scan.sarif
```

#### Static Analysis Platforms

SARIF output is compatible with:

- SonarQube/SonarCloud (via import)
- Fortify
- Checkmarx
- CodeQL
- Snyk
- And many other SARIF-compatible tools

## Software Bill of Materials (SBOM)

Generate CycloneDX-compliant SBOMs with license information:

```bash
promptfoo scan-model models/ --sbom model-sbom.json
```

The SBOM includes:

- Component information (files, types, sizes, checksums)
- License metadata (detected licenses, copyright holders)
- Risk scoring based on scan findings
- Model/dataset classification

## Troubleshooting

### Common Issues

1. **Missing Dependencies**

   ```
   Error: h5py not installed, cannot scan Keras H5 files
   ```

   Solution: Install the required dependencies:

   ```bash
   pip install h5py tensorflow
   ```

2. **Timeout Errors**

   ```
   Error: Scan timeout after 300 seconds
   ```

   Solution: Increase the timeout:

   ```bash
   promptfoo scan-model model.pkl --timeout 7200  # 2 hours for very large models
   ```

3. **File Size Limits**

   ```
   Warning: File too large to scan
   ```

   Solution: Increase the maximum file size:

   ```bash
   promptfoo scan-model model.pkl --max-size 3GB
   ```

4. **Unknown Format**

   ```
   Warning: Unknown or unhandled format
   ```

   Solution: Ensure the file is in a supported format.

## Extending ModelAudit

### Creating Custom Scanners

You can create custom scanners by extending the `BaseScanner` class:

```python
from modelaudit.scanners.base import BaseScanner, ScanResult, IssueSeverity

class CustomModelScanner(BaseScanner):
    """Scanner for custom model format"""
    name = "custom_format"
    description = "Scans custom model format for security issues"
    supported_extensions = [".custom", ".mymodel"]

    @classmethod
    def can_handle(cls, path: str) -> bool:
        """Check if this scanner can handle the given path"""
        return path.endswith(tuple(cls.supported_extensions))

    def scan(self, path: str) -> ScanResult:
        """Scan the model file for security issues"""
        result = self._create_result()

        try:
            # Your custom scanning logic here
            with open(path, 'rb') as f:
                content = f.read()

            if b'malicious_pattern' in content:
                result.add_issue(
                    "Suspicious pattern found",
                    severity=IssueSeverity.WARNING,
                    location=path,
                    details={"pattern": "malicious_pattern"}
                )

        except Exception as e:
            result.add_issue(
                f"Error scanning file: {str(e)}",
                severity=IssueSeverity.CRITICAL,
                location=path,
                details={"exception": str(e)}
            )

        result.finish(success=True)
        return result
```

To integrate your custom scanner, add it to the scanner registry in `modelaudit/scanners/__init__.py`:

```python
# In modelaudit/scanners/__init__.py
from .custom_scanner import CustomModelScanner

# Add to the registry
registry.register(
    "custom_format",
    lambda: CustomModelScanner,
    description="Custom model format scanner",
    module="modelaudit.scanners.custom_scanner"
)
```

Custom scanners require integration into the ModelAudit package structure and cannot be dynamically registered at runtime. For production use, consider contributing your scanner to the ModelAudit project.
