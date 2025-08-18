---
sidebar_label: Advanced Usage
sidebar_position: 120
description: Automate LLM model scanning across cloud providers with remote storage integration, CI/CD workflows, and programmatic controls for advanced security testing
---

# Advanced Usage

This page covers advanced ModelAudit features including cloud storage integration, CI/CD workflows, and programmatic usage.

## Remote Model Scanning

ModelAudit can scan models directly from various remote sources without manual downloading.

### HuggingFace URL Scanning

```bash
# Standard HuggingFace URL
promptfoo scan-model https://huggingface.co/bert-base-uncased

# Short HuggingFace URL
promptfoo scan-model https://hf.co/gpt2

# HuggingFace protocol
promptfoo scan-model hf://microsoft/resnet-50

# Private models (requires HF_TOKEN environment variable)
export HF_TOKEN=your_token_here
promptfoo scan-model hf://your-org/private-model

# Using .env file (create a .env file in your project root)
echo "HF_TOKEN=your_token_here" > .env
promptfoo scan-model hf://your-org/private-model
```

### Cloud Storage

#### Amazon S3

```bash
# Using environment variables
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_DEFAULT_REGION="us-east-1"

promptfoo scan-model s3://my-bucket/model.pkl
```

#### Google Cloud Storage

```bash
# Using service account
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
promptfoo scan-model gs://my-bucket/model.pt
```

#### Cloudflare R2

```bash
# R2 uses S3-compatible authentication
export AWS_ACCESS_KEY_ID="your-r2-access-key"
export AWS_SECRET_ACCESS_KEY="your-r2-secret-key"
export AWS_ENDPOINT_URL="https://your-account.r2.cloudflarestorage.com"

promptfoo scan-model r2://my-bucket/model.safetensors
```

### Model Registries

#### MLflow

```bash
# Set MLflow tracking URI
export MLFLOW_TRACKING_URI=http://mlflow-server:5000

# Scan specific version
promptfoo scan-model models:/MyModel/1

# Scan latest version
promptfoo scan-model models:/MyModel/Latest

# With custom registry URI
promptfoo scan-model models:/MyModel/1 --registry-uri https://mlflow.company.com
```

#### JFrog Artifactory

```bash
# Using API token (recommended)
export JFROG_API_TOKEN=your_token_here
promptfoo scan-model https://company.jfrog.io/artifactory/models/model.pkl

# Or pass directly
promptfoo scan-model https://company.jfrog.io/artifactory/models/model.pkl --jfrog-api-token YOUR_TOKEN

# Using .env file (recommended for CI/CD)
echo "JFROG_API_TOKEN=your_token_here" > .env
promptfoo scan-model https://company.jfrog.io/artifactory/models/model.pkl
```

#### DVC Integration

ModelAudit automatically resolves DVC pointer files:

```bash
# Scans the actual model file referenced by the .dvc file
promptfoo scan-model model.pkl.dvc
```

## Configuration Options

ModelAudit's behavior can be customized through command-line options. While configuration files are not currently supported, you can achieve similar results using CLI flags:

```bash
# Set blacklist patterns
modelaudit scan models/ \
  --blacklist "deepseek" \
  --blacklist "qwen" \
  --blacklist "unsafe_model"

# Set resource limits
modelaudit scan models/ \
  --max-file-size 1073741824 \
  --max-total-size 5368709120 \
  --timeout 600

# Combine multiple options
modelaudit scan models/ \
  --blacklist "suspicious_pattern" \
  --max-file-size 1073741824 \
  --timeout 600 \
  --verbose
```

Note: Advanced scanner-specific configurations (like pickle opcodes limits or weight distribution thresholds) are currently hardcoded and cannot be modified via CLI.

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
        run: promptfoo scan-model models/ --format json --output scan-results.json

      - name: Check for critical issues
        run: |
          if grep -q '"severity":"critical"' scan-results.json; then
            echo "Critical security issues found in models!"
            exit 1
          fi

      - name: Upload scan results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: model-scan-results
          path: scan-results.json
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

## Advanced Security Features

### File Type Validation

ModelAudit performs comprehensive file type validation:

```bash
# File type mismatches are flagged
⚠ File type validation failed: extension indicates tensor_binary but magic bytes indicate pickle.
   This could indicate file spoofing, corruption, or a security threat.
```

### Resource Exhaustion Protection

Built-in protection against various attacks:

- **Zip bombs**: Detects suspicious compression ratios (>100x)
- **Decompression bombs**: Limits decompressed file sizes
- **Memory exhaustion**: Enforces limits on array sizes and nested structures
- **Infinite recursion**: Limits nesting depth in recursive formats
- **DoS prevention**: Enforces timeouts and maximum file sizes

### Path Traversal Protection

Automatic protection in archives:

```bash
🔴 Archive entry ../../etc/passwd attempted path traversal outside the archive
```

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
   promptfoo scan-model model.pkl --timeout 600
   ```

3. **File Size Limits**

   ```
   Warning: File too large to scan: 2147483648 bytes (max: 1073741824)
   ```

   Solution: Increase the maximum file size:

   ```bash
   promptfoo scan-model model.pkl --max-file-size 3221225472
   ```

4. **Unknown Format**

   ```
   Warning: Unknown or unhandled format
   ```

   Solution: Ensure the file is in a supported format or create a custom scanner.

5. **Binary File Format Detection**

   ```
   Info: Detected safetensors format in .bin file
   ```

   Note: ModelAudit automatically detects the actual format of `.bin` files and applies the appropriate scanner.

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

Register your custom scanner:

```python
from modelaudit.scanners import SCANNER_REGISTRY
from my_custom_scanner import CustomModelScanner

# Register the custom scanner
SCANNER_REGISTRY.append(CustomModelScanner)

# Now you can use it
from modelaudit.core import scan_model_directory_or_file
results = scan_model_directory_or_file("path/to/custom_model.mymodel")
```
