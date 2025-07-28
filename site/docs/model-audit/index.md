---
title: ModelAudit - Static Security Scanner for ML Models
description: Scan AI/ML models for security vulnerabilities, malicious code, and backdoors. Supports PyTorch, TensorFlow, ONNX, Keras, and 15+ model formats.
keywords:
  [
    model security,
    AI security,
    ML security scanning,
    static analysis,
    malicious model detection,
    pytorch security,
    tensorflow security,
    model vulnerability scanner,
  ]
sidebar_label: Overview
sidebar_position: 1
---

# Model Scanning

## Overview

ModelAudit is a lightweight static security scanner for machine learning models integrated into Promptfoo. It allows you to quickly scan your AI/ML models for potential security risks before deploying them in production environments.

By invoking `promptfoo scan-model`, you can use ModelAudit's static security scanning capabilities.

![example model scan results](/img/docs/modelaudit/modelaudit-result.png)

Promptfoo also includes a UI that allows you to set up a scan:

![model scan](/img/docs/modelaudit/model-audit-setup.png)

And displays the results:

![model scan results](/img/docs/modelaudit/model-audit-results.png)

## Purpose

AI/ML models can introduce security risks through:

- Malicious code embedded in pickled models
- Suspicious TensorFlow operations
- Potentially unsafe Keras Lambda layers
- Dangerous pickle opcodes
- Encoded payloads hidden in model structures
- Risky configurations in model architectures
- Malicious content in ZIP archives
- Embedded executables in binary model files

ModelAudit helps identify these risks before models are deployed to production environments, ensuring a more secure AI pipeline.

## Installation

### Using Promptfoo

The easiest way to use ModelAudit is through Promptfoo:

```bash
# Install Promptfoo globally
npm install -g promptfoo

# Install modelaudit dependency
pip install modelaudit
```

### Standalone Installation

You can also install ModelAudit directly:

```bash
# Basic installation
pip install modelaudit

# With optional dependencies for specific model formats
pip install modelaudit[tensorflow,h5,pytorch]

# For all dependencies
pip install modelaudit[all]

# Or install specific components:
pip install modelaudit[tensorflow,h5,pytorch]  # Core ML frameworks
pip install modelaudit[cloud,mlflow]           # Remote model access
pip install modelaudit[numpy1]                 # NumPy 1.x compatibility
```

### Docker

```bash
# Pull from GitHub Container Registry
docker pull ghcr.io/promptfoo/modelaudit:latest

# Use specific variants
docker pull ghcr.io/promptfoo/modelaudit:latest-full        # All ML frameworks
docker pull ghcr.io/promptfoo/modelaudit:latest-tensorflow  # TensorFlow only

# Run with Docker
docker run --rm -v $(pwd):/data ghcr.io/promptfoo/modelaudit:latest scan /data/model.pkl
```

## Usage

### Basic Command Structure

```bash
promptfoo scan-model [OPTIONS] PATH...
```

### Examples

```bash
# Scan a single model file
promptfoo scan-model model.pkl

# Scan a model directly from HuggingFace without downloading
promptfoo scan-model https://huggingface.co/bert-base-uncased
promptfoo scan-model hf://microsoft/resnet-50

# Scan from cloud storage
promptfoo scan-model s3://my-bucket/model.pt
promptfoo scan-model gs://my-bucket/model.h5

# Scan from MLflow registry
promptfoo scan-model models:/MyModel/1

# Scan multiple models and directories
promptfoo scan-model model.pkl model2.h5 models_directory

# Export results to JSON
promptfoo scan-model model.pkl --format json --output results.json

# Add custom blacklist patterns
promptfoo scan-model model.pkl --blacklist "unsafe_model" --blacklist "malicious_net"

# Enable verbose output
promptfoo scan-model model.pkl --verbose

# Set file size limits
promptfoo scan-model models/ --max-file-size 1073741824 --max-total-size 5368709120

# Generate Software Bill of Materials
promptfoo scan-model model.pkl --sbom sbom.json
```

See the [Advanced Usage](./usage.md) guide for detailed authentication setup for cloud storage, JFrog, and other remote sources.

:::info Alternative Installation and Usage

- **Standalone**: Install modelaudit directly using `pip install modelaudit`. `modelaudit scan` behaves the same as `promptfoo scan-model`.
- **Web Interface**: For a GUI experience, use `promptfoo view` and navigate to `/model-audit` for visual scanning and configuration.
  :::

### Options

| Option                 | Description                                                      |
| ---------------------- | ---------------------------------------------------------------- |
| `--blacklist`, `-b`    | Additional blacklist patterns to check against model names       |
| `--format`, `-f`       | Output format (`text` or `json`) [default: text]                 |
| `--output`, `-o`       | Output file path (prints to stdout if not specified)             |
| `--timeout`, `-t`      | Scan timeout in seconds [default: 300]                           |
| `--verbose`, `-v`      | Enable verbose output                                            |
| `--max-file-size`      | Maximum file size to scan in bytes [default: unlimited]          |
| `--max-total-size`     | Maximum total bytes to scan before stopping [default: unlimited] |
| `--sbom`               | Generate CycloneDX Software Bill of Materials with license info  |
| `--registry-uri`       | MLflow registry URI (only used for MLflow model URIs)            |
| `--jfrog-api-token`    | JFrog API token for authentication                               |
| `--jfrog-access-token` | JFrog access token for authentication                            |

## Web Interface

Promptfoo includes a web interface for ModelAudit at `/model-audit` with visual path selection, real-time progress tracking, and detailed results visualization.

**Access:** Run `promptfoo view` and navigate to `http://localhost:15500/model-audit`

**Key Features:**

- Visual file/directory selection with current working directory context
- GUI configuration for all scan options (blacklist patterns, timeouts, file limits)
- Live scanning progress and tabbed results display with severity color coding
- Scan history and automatic installation detection

## Supported Formats

ModelAudit supports scanning 15+ model formats across major ML frameworks:

### Model Formats

| Format                    | Extensions                                           | Description                                             |
| ------------------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| **PyTorch**               | `.pt`, `.pth`, `.bin`                                | PyTorch model files and checkpoints                     |
| **TensorFlow SavedModel** | `.pb`, directories                                   | TensorFlow's standard model format                      |
| **TensorFlow Lite**       | `.tflite`                                            | Mobile-optimized TensorFlow models                      |
| **TensorRT**              | `.engine`, `.plan`                                   | NVIDIA GPU-optimized inference engines                  |
| **Keras**                 | `.h5`, `.keras`, `.hdf5`                             | Keras/TensorFlow models in HDF5 format                  |
| **ONNX**                  | `.onnx`                                              | Open Neural Network Exchange format                     |
| **SafeTensors**           | `.safetensors`                                       | Hugging Face's secure tensor format                     |
| **GGUF/GGML**             | `.gguf`, `.ggml`, `.ggmf`, `.ggjt`, `.ggla`, `.ggsa` | Quantized models (LLaMA, Mistral, etc.)                 |
| **Flax/JAX**              | `.msgpack`, `.flax`, `.orbax`, `.jax`                | JAX-based model formats                                 |
| **JAX Checkpoints**       | `.ckpt`, `.checkpoint`, `.orbax-checkpoint`          | JAX training checkpoints                                |
| **Pickle**                | `.pkl`, `.pickle`, `.dill`                           | Python serialization (includes Dill)                    |
| **Joblib**                | `.joblib`                                            | Scikit-learn and general ML serialization               |
| **NumPy**                 | `.npy`, `.npz`                                       | NumPy array storage formats                             |
| **PMML**                  | `.pmml`                                              | Predictive Model Markup Language (XML)                  |
| **ZIP Archives**          | `.zip`                                               | Compressed model archives with recursive scanning       |
| **Container Manifests**   | `.manifest`                                          | OCI/Docker layer scanning                               |
| **Binary Files**          | `.bin`                                               | Auto-detected format (PyTorch, ONNX, SafeTensors, etc.) |

### Remote Sources

| Source                   | URL Format                                           | Example                                                 |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------------- |
| **HuggingFace Hub**      | `https://huggingface.co/`, `https://hf.co/`, `hf://` | `hf://microsoft/resnet-50`                              |
| **Amazon S3**            | `s3://`                                              | `s3://my-bucket/model.pt`                               |
| **Google Cloud Storage** | `gs://`                                              | `gs://my-bucket/model.h5`                               |
| **Cloudflare R2**        | `r2://`                                              | `r2://my-bucket/model.safetensors`                      |
| **MLflow Registry**      | `models:/`                                           | `models:/MyModel/1`                                     |
| **JFrog Artifactory**    | `https://*.jfrog.io/`                                | `https://company.jfrog.io/artifactory/models/model.pkl` |
| **DVC**                  | `.dvc` files                                         | `model.pkl.dvc`                                         |

## Security Checks Performed

The scanner looks for various security issues, including:

- **Malicious Code**: Detecting potentially dangerous code in pickled models
- **Suspicious Operations**: Identifying risky TensorFlow operations and custom ONNX operators
- **Unsafe Layers**: Finding potentially unsafe Keras Lambda layers
- **Blacklisted Names**: Checking for models with names matching suspicious patterns
- **Dangerous Serialization**: Detecting unsafe pickle opcodes, nested pickle payloads, and decode-exec chains
- **Enhanced Dill/Joblib Security**: ML-aware scanning with format validation and bypass prevention
- **Encoded Payloads**: Looking for suspicious strings that might indicate hidden code
- **Risky Configurations**: Identifying dangerous settings in model architectures
- **XML Security**: Detecting XXE attacks and malicious content in PMML files
- **Embedded Executables**: Detecting Windows PE, Linux ELF, and macOS Mach-O files
- **Container Security**: Scanning model files within OCI/Docker container layers
- **Compression Attacks**: Detecting zip bombs and decompression attacks
- **Weight Anomalies**: Statistical analysis to detect potential backdoors
- **Format Integrity**: Validating file format structure
- **License Compliance**: Detecting AGPL obligations and commercial restrictions
- **DVC Integration**: Automatic resolution and scanning of DVC-tracked models

## Interpreting Results

The scan results are classified by severity:

- **CRITICAL**: Definite security concerns that should be addressed immediately
- **WARNING**: Potential issues that require review
- **INFO**: Informational findings, not necessarily security concerns
- **DEBUG**: Additional details (only shown with `--verbose`)

Some issues include a "Why" explanation to help understand the security risk:

```
1. suspicious_model.pkl (pos 28): [CRITICAL] Suspicious module reference found: posix.system
   Why: The 'os' module provides direct access to operating system functions.
```

## Integration in Workflows

ModelAudit is particularly useful in CI/CD pipelines when incorporated with Promptfoo:

```bash
# Example CI/CD script segment
npm install -g promptfoo
pip install modelaudit
promptfoo scan-model --format json --output scan-results.json ./models/
if [ $? -ne 0 ]; then
  echo "Security issues found in models! Check scan-results.json"
  exit 1
fi
```

### Exit Codes

ModelAudit returns specific exit codes for automation:

- **0**: No security issues found ✅
- **1**: Security issues detected (warnings or critical) 🟡
- **2**: Scan errors occurred (installation, file access, etc.) 🔴

:::tip CI/CD Best Practice
In CI/CD pipelines, exit code 1 indicates findings that should be reviewed but don't necessarily block deployment. Only exit code 2 represents actual scan failures.
:::

## Requirements

ModelAudit is included with Promptfoo, but specific model formats may require additional dependencies:

```bash
# For TensorFlow models
pip install tensorflow

# For PyTorch models
pip install torch

# For Keras models with HDF5
pip install h5py

# For YAML configuration scanning
pip install pyyaml

# For SafeTensors support
pip install safetensors

# For HuggingFace URL scanning
pip install huggingface-hub

# For cloud storage scanning
pip install boto3 google-cloud-storage

# For MLflow registry scanning
pip install mlflow
```

### NumPy Compatibility

ModelAudit supports both NumPy 1.x and 2.x. Use the `doctor` command to diagnose scanner compatibility:

```bash
# Check system diagnostics and scanner status
modelaudit doctor

# Show details about failed scanners
modelaudit doctor --show-failed

# Force NumPy 1.x if needed for full compatibility
pip install modelaudit[numpy1]
```

The `doctor` command provides:

- Python and NumPy version information
- Scanner loading status (available, loaded, failed)
- Recommendations for fixing compatibility issues

## Next Steps

- **[Advanced Usage](./usage.md)** - Cloud storage, CI/CD integration, and advanced features
- **[Scanner Reference](./scanners.md)** - Detailed scanner capabilities and security checks
