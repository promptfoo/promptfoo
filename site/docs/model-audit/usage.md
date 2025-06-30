---
sidebar_label: Installation
sidebar_position: 120
---

# Installation & Usage

This page covers how to install ModelAudit and use it.

## Installation

### Using Promptfoo

The easiest way to use ModelAudit is through Promptfoo, which includes it as an integrated tool:

```bash
# Install Promptfoo globally
npm install -g promptfoo

# Or using Homebrew
brew install promptfoo

# Install modelaudit dependency
pip install modelaudit
```

Once Promptfoo is installed, you can use ModelAudit via the `scan-model` command:

```bash
promptfoo scan-model <path-to-model>
```

### Standalone Installation

You can also install ModelAudit directly and run it from the command line:

```bash
# Using pip
pip install modelaudit

# Or with optional dependencies for specific model formats
pip install modelaudit[tensorflow,h5,pytorch]

# For YAML manifest scanning support
pip install modelaudit[yaml]

# For all dependencies
pip install modelaudit[all]
```

## Dependencies

ModelAudit has different dependencies depending on which model formats you want to scan:

| Model Format          | Required Packages                                          |
| --------------------- | ---------------------------------------------------------- |
| Pickle files          | Built-in (no additional dependencies)                      |
| TensorFlow SavedModel | `tensorflow`                                               |
| TensorFlow Lite       | `tensorflow` (for tflite runtime)                          |
| Keras H5              | `h5py`, `tensorflow`                                       |
| PyTorch               | `zipfile` (built-in), `torch` for weight analysis          |
| ONNX                  | `onnx`                                                     |
| GGUF/GGML             | Built-in (no additional dependencies)                      |
| Joblib                | `joblib`                                                   |
| Flax/JAX              | `msgpack`                                                  |
| NumPy arrays          | `numpy` (built-in)                                         |
| SafeTensors           | `safetensors`                                              |
| OCI/Docker containers | Built-in (no additional dependencies)                      |
| YAML manifests        | `pyyaml`                                                   |
| ZIP archives          | Built-in (no additional dependencies)                      |
| Weight Distribution   | `numpy`, `scipy`, format-specific libs (torch, h5py, etc.) |
| HuggingFace URLs      | `huggingface-hub`                                          |

## Advanced Usage

### HuggingFace URL Scanning

ModelAudit can scan models directly from HuggingFace without requiring manual downloads. This feature automatically handles model downloading, scanning, and cleanup.

#### Supported URL Formats

```bash
# Standard HuggingFace URL
modelaudit scan https://huggingface.co/bert-base-uncased

# Short HuggingFace URL
modelaudit scan https://hf.co/gpt2

# HuggingFace protocol
modelaudit scan hf://microsoft/resnet-50

# Organization/model format
modelaudit scan https://huggingface.co/facebook/bart-large

# Single-component models (no organization)
modelaudit scan https://huggingface.co/bert-base-uncased
```

#### How It Works

1. **Automatic Download**: ModelAudit uses the `huggingface-hub` library to download the model to a temporary directory
2. **Security Scanning**: All model files are scanned with the appropriate scanners based on their format
3. **Automatic Cleanup**: Downloaded files are automatically removed after scanning completes
4. **Multi-file Support**: Scans all files in the model repository (config.json, pytorch_model.bin, model.safetensors, etc.)

#### Examples

```bash
# Scan a BERT model
promptfoo scan-model https://huggingface.co/bert-base-uncased

# Scan multiple models including HuggingFace URLs
promptfoo scan-model local_model.pkl https://hf.co/gpt2 ./models/

# Export results to JSON
promptfoo scan-model hf://microsoft/resnet-50 --format json --output results.json

# Scan with custom timeout (useful for large models)
promptfoo scan-model https://huggingface.co/meta-llama/Llama-2-7b --timeout 600
```

#### Requirements

To use HuggingFace URL scanning, install the required dependency:

```bash
pip install huggingface-hub
```

Or with ModelAudit's all dependencies:

```bash
pip install modelaudit[all]
```

### Command Line Interface

ModelAudit provides a flexible command line interface with various options:

```bash
modelaudit scan [OPTIONS] PATH [PATH...]
```

#### Global Options

| Option              | Description                                                     |
| ------------------- | --------------------------------------------------------------- |
| `--blacklist`, `-b` | Additional blacklist patterns (can be specified multiple times) |
| `--format`, `-f`    | Output format: `text` or `json`                                 |
| `--output`, `-o`    | Output file path                                                |
| `--timeout`, `-t`   | Scan timeout in seconds (default: 300)                          |
| `--verbose`, `-v`   | Enable verbose output                                           |
| `--max-file-size`   | Maximum file size to scan in bytes                              |
| `--max-total-size`  | Maximum total bytes to scan before stopping                     |

:::info Feature Parity Achieved
The Promptfoo CLI wrapper (`promptfoo scan-model`) now provides full feature parity with the standalone `modelaudit` command, including all advanced options.
:::

### Configuration File

For more complex scanning requirements, you can use a configuration file. For example:

```yaml
# modelaudit-config.yaml
blacklist_patterns:
  - 'deepseek'
  - 'qwen'

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
    suspicious_config_properties:
      - 'eval'
      - 'exec'
      - 'import'
      - 'system'

  manifest:
    blacklist_patterns:
      - 'unsafe_model'

  zip:
    max_zip_depth: 5 # Maximum nesting depth for zip files
    max_zip_entries: 10000 # Maximum number of entries per zip
    max_entry_size: 10485760 # 10MB max size per extracted file

  weight_distribution:
    z_score_threshold: 3.0 # Threshold for outlier detection (higher = less sensitive)
    cosine_similarity_threshold: 0.7 # Minimum similarity between neuron weight vectors
    weight_magnitude_threshold: 3.0 # Standard deviations for extreme weight detection
    llm_vocab_threshold: 10000 # Vocabulary size to identify LLM models
    enable_llm_checks: false # Whether to scan large language models

  pmml:
    has_defusedxml: true # Whether defusedxml is available for secure XML parsing
    max_file_size: 50000000 # 50MB max size for PMML files

  numpy:
    max_array_bytes: 1073741824 # 1GB max array size
    max_dimensions: 32 # Maximum number of array dimensions
    max_dimension_size: 100000000 # Maximum size per dimension
    max_itemsize: 1024 # Maximum size per array element in bytes

  joblib:
    max_decompression_ratio: 100.0 # Maximum compression ratio before flagging as bomb
    max_decompressed_size: 104857600 # 100MB max decompressed size
    max_file_read_size: 104857600 # 100MB max file read size

  flax_msgpack:
    max_blob_bytes: 52428800 # 50MB max binary blob size
    max_recursion_depth: 100 # Maximum nesting depth
    max_items_per_container: 10000 # Maximum items per container

# Global settings
max_file_size: 1073741824 # 1GB
timeout: 600 # 10 minutes
```

Use the configuration file with:

```bash
# Standalone command (config files only supported here)
modelaudit scan --config modelaudit-config.yaml path/to/models/

# Promptfoo CLI (config files not supported - use CLI options instead)
promptfoo scan-model --verbose --max-file-size 1000000 path/to/models/
```

## Promptfoo vs Standalone

When using ModelAudit through Promptfoo, you get additional benefits:

- **Web Interface**: Access via `promptfoo view` at `/model-audit` (see [overview](./index.md#web-interface) for details)
- **Integrated Workflows**: Seamless integration with Promptfoo evaluation pipelines
- **Unified Installation**: Single `npm install` gets both Promptfoo and ModelAudit integration

## Advanced Security Features

### File Type Validation

ModelAudit performs comprehensive file type validation as a security measure:

```bash
# File type mismatches are flagged as potential security issues
⚠ File type validation failed: extension indicates tensor_binary but magic bytes indicate pickle.
   This could indicate file spoofing, corruption, or a security threat.
```

This helps detect:

- **File spoofing attacks** where malicious files masquerade as legitimate model formats
- **Corruption** that might indicate tampering
- **Format confusion** that could lead to incorrect handling

### Resource Exhaustion Protection

Built-in protection against various resource exhaustion attacks:

- **Zip bombs**: Detects suspicious compression ratios (>100x) in archives
- **Decompression bombs**: Limits decompressed file sizes in joblib and other compressed formats
- **Memory exhaustion**: Enforces limits on array sizes, tensor dimensions, and nested structures
- **Infinite recursion**: Limits nesting depth in recursive file formats
- **DoS prevention**: Enforces timeouts and maximum file sizes

### Path Traversal Protection

Automatic protection against path traversal attacks in archives:

```bash
🔴 Archive entry ../../etc/passwd attempted path traversal outside the archive
```

All archive scanners (ZIP, model archives, OCI) include path sanitization to prevent:

- Directory traversal attacks (`../../../etc/passwd`)
- Absolute path exploitation (`/etc/passwd`)
- Windows path attacks (`C:\Windows\System32\`)

### Executable Detection

Sophisticated detection of embedded executables with validation:

- **Windows PE files**: Detection including DOS stub signature validation
- **Linux ELF files**: Magic byte verification and structure validation
- **macOS Mach-O**: Multiple architecture support and validation
- **Script detection**: Shell script shebangs and interpreter directives

## Integration with Development Workflows

### Pre-commit Hook

You can add ModelAudit as a pre-commit hook to scan models before committing them:

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: modelaudit
        name: ModelAudit
        entry: modelaudit scan
        language: system
        files: '\.(pkl|h5|pb|pt|pth|keras|hdf5|json|yaml|yml|zip|onnx|safetensors|bin|tflite|msgpack|pmml|joblib|npy|gguf|ggml)$'
        pass_filenames: true
```

### CI/CD Integration

#### GitHub Actions

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
      - '**.zip'
      - '**.onnx'
      - '**.safetensors'
      - '**.bin'
      - '**.tflite'
      - '**.msgpack'

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.10'

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install modelaudit[all]

      - name: Scan models
        run: modelaudit scan models/ --format json --output scan-results.json

      - name: Check for critical issues
        run: |
          if grep -q '"severity":"critical"' scan-results.json; then
            echo "Critical security issues found in models!"
            exit 1
          fi

      - name: Upload scan results
        uses: actions/upload-artifact@v3
        with:
          name: model-scan-results
          path: scan-results.json
```

#### GitLab CI

```yaml
# .gitlab-ci.yml
model_security_scan:
  stage: test
  image: python:3.10
  script:
    - pip install modelaudit[all]
    - modelaudit scan models/ --format json --output scan-results.json
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
      - '**/*.zip'
      - '**/*.onnx'
      - '**/*.safetensors'
      - '**/*.bin'
      - '**/*.tflite'
      - '**/*.msgpack'
```

## Programmatic Usage

You can also use ModelAudit programmatically in your Python code:

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

# Scan multiple sources including HuggingFace URLs
sources = [
    "local_model.pkl",
    "https://hf.co/gpt2",
    "hf://microsoft/resnet-50",
    "./models/"
]

for source in sources:
    results = scan_model_directory_or_file(source)
    print(f"Scanning {source}: {len(results['issues'])} issues found")

# Scan a ZIP archive with custom settings
zip_config = {
    "max_zip_depth": 3,  # Limit nesting depth
    "max_zip_entries": 1000,  # Limit number of files
    "max_entry_size": 5242880  # 5MB per file
}

results = scan_model_directory_or_file("dataset.zip", **zip_config)
```

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
        # Your logic to determine if this scanner can handle the file
        return path.endswith(tuple(cls.supported_extensions))

    def scan(self, path: str) -> ScanResult:
        """Scan the model file for security issues"""
        # Check if path is valid
        path_check_result = self._check_path(path)
        if path_check_result:
            return path_check_result

        result = self._create_result()

        try:
            # Your custom scanning logic here
            # ...

            # Add issues if found
            result.add_issue(
                "Suspicious pattern found",
                severity=IssueSeverity.WARNING,
                location=path,
                details={"pattern": "example_pattern"}
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

# Now you can use it with the standard scan function
from modelaudit.core import scan_model_directory_or_file
results = scan_model_directory_or_file("path/to/custom_model.mymodel")
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

   Solution: Ensure the file is in a supported format or create a custom scanner for the format.

5. **Binary File Format Detection**

   ```
   Info: Detected safetensors format in .bin file
   ```

   Note: ModelAudit automatically detects the actual format of `.bin` files and applies the appropriate scanner. Supported formats include pickle, SafeTensors, ONNX, and raw tensor data. The binary scanner also detects embedded executables with PE file detection.
