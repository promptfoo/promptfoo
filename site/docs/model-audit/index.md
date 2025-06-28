---
sidebar_label: Overview
sidebar_position: 1
---

# Model Scanning

## Overview

ModelAudit is a lightweight static security scanner for machine learning models integrated into Promptfoo. It allows you to quickly scan your AIML models for potential security risks before deploying them in production environments.

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
- Encoded payloads hidden in model structures
- Risky configurations in model architectures
- Malicious content in ZIP archives and compressed model files
- Embedded executables in binary model files

ModelAudit helps identify these risks before models are deployed to production environments, ensuring a more secure AI pipeline.

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
promptfoo scan-model https://hf.co/gpt2

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
```

:::info Alternative Installation and Usage

- **Standalone**: Install modelaudit directly using `pip install modelaudit`. `modelaudit scan` behaves the same as `promptfoo scan-model`.
- **Web Interface**: For a GUI experience, use `promptfoo view` and navigate to `/model-audit` for visual scanning and configuration.
  :::

### Options

| Option              | Description                                                      |
| ------------------- | ---------------------------------------------------------------- |
| `--blacklist`, `-b` | Additional blacklist patterns to check against model names       |
| `--format`, `-f`    | Output format (`text` or `json`) [default: text]                 |
| `--output`, `-o`    | Output file path (prints to stdout if not specified)             |
| `--timeout`, `-t`   | Scan timeout in seconds [default: 300]                           |
| `--verbose`, `-v`   | Enable verbose output                                            |
| `--max-file-size`   | Maximum file size to scan in bytes [default: unlimited]          |
| `--max-total-size`  | Maximum total bytes to scan before stopping [default: unlimited] |

## Web Interface

Promptfoo includes a web interface for ModelAudit at `/model-audit` with visual path selection, real-time progress tracking, and detailed results visualization.

**Access:** Run `promptfoo view` and navigate to `http://localhost:15500/model-audit`

**Key Features:**

- Visual file/directory selection with current working directory context
- GUI configuration for all scan options (blacklist patterns, timeouts, file limits)
- Live scanning progress and tabbed results display with severity color coding
- Scan history and automatic installation detection

## Supported Model Formats

ModelAudit can scan:

- **PyTorch models** (`.pt`, `.pth`, `.bin`)
- **TensorFlow SavedModel** format (`.pb` files and directories)
- **TensorFlow Lite models** (`.tflite`)
- **Keras models** (`.h5`, `.keras`, `.hdf5`)
- **ONNX models** (`.onnx`)
- **GGUF/GGML models** (`.gguf`, `.ggml`) - popular for LLaMA, Alpaca, and other quantized LLMs
- **Flax/JAX models** (`.msgpack`) - JAX neural network checkpoints
- **Pickle files** (`.pkl`, `.pickle`, `.bin`, `.ckpt`)
- **Joblib files** (`.joblib`) - commonly used by ML libraries
- **NumPy arrays** (`.npy`)
- **SafeTensors models** (`.safetensors`, `.bin` with SafeTensors format)
- **PMML models** (`.pmml`) - Predictive Model Markup Language with XML security validation
- **Container manifests** (`.manifest`) with embedded model layers
- **ZIP archives** (`.zip`, `.npz`) with recursive content scanning
- **Binary model files** (`.bin`) including:
  - SafeTensors format (auto-detected)
  - ONNX models
  - Raw PyTorch tensor files
  - Embedded executables (PE, ELF, Mach-O)
- **Model configuration files** (`.json`, `.yaml`, etc.)
- **HuggingFace URLs** - scan models directly from HuggingFace without downloading:
  - `https://huggingface.co/user/model`
  - `https://hf.co/user/model`
  - `hf://user/model`

## Security Checks Performed

The scanner looks for various security issues, including:

- **Malicious Code**: Detecting potentially dangerous code in pickled models
- **Suspicious Operations**: Identifying risky TensorFlow operations and custom ONNX operators
- **Unsafe Layers**: Finding potentially unsafe Keras Lambda layers
- **Blacklisted Names**: Checking for models with names matching suspicious patterns
- **Dangerous Serialization**: Detecting unsafe pickle opcodes and patterns
- **Encoded Payloads**: Looking for suspicious strings that might indicate hidden code
- **Risky Configurations**: Identifying dangerous settings in model architectures
- **XML Security**: Detecting XXE attacks and malicious content in PMML files using secure parsing
- **Embedded Executables**: Detecting Windows PE (with DOS stub validation), Linux ELF, and macOS Mach-O files
- **Container Security**: Scanning model files within OCI/Docker container layers
- **Compression Attacks**: Detecting zip bombs and decompression attacks in archives and joblib files
- **Weight Anomalies**: Statistical analysis to detect potential backdoors or trojans in neural networks
- **Format Integrity**: Validating file format structure and preventing malformed file attacks

## Interpreting Results

The scan results are classified by severity:

- **CRITICAL**: Definite security concerns that should be addressed immediately
- **WARNING**: Potential issues that require review
- **INFO**: Informational findings, not necessarily security concerns
- **DEBUG**: Additional details (only shown with `--verbose`)

## Integration in Workflows

ModelAudit is particularly useful in CI/CD pipelines when incorporated with Promptfoo:

```bash
# Example CI/CD script segment
npm install -g promptfoo
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
```
