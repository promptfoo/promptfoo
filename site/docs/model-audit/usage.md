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

| Model Format          | Required Packages                     |
| --------------------- | ------------------------------------- |
| Pickle files          | Built-in (no additional dependencies) |
| TensorFlow SavedModel | `tensorflow`                          |
| Keras H5              | `h5py`, `tensorflow`                  |
| PyTorch               | `zipfile` (built-in)                  |
| YAML manifests        | `pyyaml`                              |

## Advanced Usage

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

# Global settings
max_file_size: 1073741824 # 1GB
timeout: 600 # 10 minutes
```

Use the configuration file with:

```bash
modelaudit scan --config modelaudit-config.yaml path/to/models/
```

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
        entry: promptfoo scan-model
        language: system
        files: '\.(pkl|h5|pb|pt|pth|keras|hdf5|json|yaml|yml)$'
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

      - name: Check for errors
        run: |
          if grep -q '"severity":"error"' scan-results.json; then
            echo "Security issues found in models!"
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
    - if grep -q '"severity":"error"' scan-results.json; then echo "Security issues found!"; exit 1; fi
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

## Programmatic Usage

You can also use ModelAudit programmatically in your Python code:

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

# Scan with custom configuration
config = {
    "blacklist_patterns": ["unsafe_model", "malicious_net"],
    "max_file_size": 1073741824,  # 1GB
    "timeout": 600  # 10 minutes
}

results = scan_model_directory_or_file("path/to/models/", **config)
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
                severity=IssueSeverity.ERROR,
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
