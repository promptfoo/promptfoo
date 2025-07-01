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

ModelAudit is a lightweight static security scanner for machine learning models, integrated into Promptfoo. Scan your AI/ML models for malicious code, backdoors, and security vulnerabilities before production deployment.

Use `promptfoo scan-model` to access ModelAudit's comprehensive security scanning capabilities across 15+ model formats and remote sources.

![example model scan results](/img/docs/modelaudit/modelaudit-result.png)

## Why Use ModelAudit?

AI/ML models can introduce security risks through:

- Malicious code embedded in pickled models
- Suspicious TensorFlow operations
- Potentially unsafe Keras Lambda layers
- Encoded payloads hidden in model structures
- Risky configurations in model architectures
- Malicious content in ZIP archives and compressed model files
- Embedded executables in binary model files

ModelAudit helps identify these risks before models are deployed to production environments, ensuring a more secure AI pipeline.

## Quick Start

```bash
# Install
npm install -g promptfoo
pip install modelaudit

# Scan a model
promptfoo scan-model ./model.pkl

# Scan from HuggingFace
promptfoo scan-model hf://microsoft/resnet-50

# Export results
promptfoo scan-model ./models/ --format json --output results.json
```

For detailed installation and usage, see the **[Installation Guide](./installation.md)** and **[Usage Guide](./usage.md)**.

## Supported Formats

| Format                                                        | Extensions               | Description                     |
| ------------------------------------------------------------- | ------------------------ | ------------------------------- |
| **[PyTorch](./scanners.md#pytorch-zip-scanner)**              | `.pt`, `.pth`, `.bin`    | ZIP archives and raw tensors    |
| **[TensorFlow](./scanners.md#tensorflow-savedmodel-scanner)** | `.pb`, `.tflite`         | SavedModel and TensorFlow Lite  |
| **[Keras](./scanners.md#keras-h5-scanner)**                   | `.h5`, `.keras`, `.hdf5` | Including Lambda layer analysis |
| **[ONNX](./scanners.md#onnx-scanner)**                        | `.onnx`                  | With custom operator detection  |
| **[SafeTensors](./scanners.md#safetensors-scanner)**          | `.safetensors`           | Safer alternative to pickle     |
| **[GGUF/GGML](./scanners.md#ggufggml-scanner)**               | `.gguf`, `.ggml`         | LLaMA and quantized LLMs        |
| **[Cloud/Remote](./usage.md#remote-model-scanning)**          | Various                  | S3, GCS, HuggingFace, MLflow    |

[View all 15+ supported formats →](./scanners.md)

## How It Works

ModelAudit performs three types of security analysis:

1. **Code Execution Risks**: Detects malicious code, unsafe operations, and arbitrary code execution paths
2. **Data Integrity**: Validates formats, finds embedded threats, and checks for anomalies
3. **Compliance**: License detection, SBOM generation, and custom security patterns

## Understanding Results

```bash
✓ Scanning model.pkl
🚨 Found 2 critical, 1 warning

1. model.pkl (pos 28): [CRITICAL] Suspicious module reference found: os.system
2. model.pkl (pos 71): [WARNING] Found REDUCE opcode - potential code execution
```

- 🚨 **CRITICAL**: Immediate security concerns requiring investigation
- ⚠️ **WARNING**: Potential issues that should be reviewed
- ℹ️ **INFO**: Informational findings
- 🔍 **DEBUG**: Detailed analysis (use `--verbose`)

## Integration

### CI/CD

```yaml
# GitHub Actions example
- name: Scan models
  run: |
    npm install -g promptfoo
    pip install modelaudit
    promptfoo scan-model models/ --format json --output results.json
    if grep -q '"severity":"critical"' results.json; then
      echo "Critical issues found!"
      exit 1
    fi
```

**Exit codes**: 0 (clean), 1 (issues found), 2 (scan error)

### Web Interface

Run `promptfoo view` and navigate to `/model-audit` for visual scanning with progress tracking and result visualization.

## Next Steps

- **[Installation Guide](./installation.md)** - Get started in 5 minutes
- **[Usage Guide](./usage.md)** - CLI options and integrations
- **[Scanner Reference](./scanners.md)** - Detailed scanner capabilities
