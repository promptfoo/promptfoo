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

Promptfoo also includes a UI that allows you to set up a scan:

![model scan](/img/docs/modelaudit/model-audit-setup.png)

And displays the results:

![model scan results](/img/docs/modelaudit/model-audit-results.png)

## Purpose

AI/ML models can introduce significant security risks that traditional security tools miss. These threats include malicious code embedded in pickled models, suspicious TensorFlow operations, potentially unsafe Keras Lambda layers, encoded payloads hidden in model structures, risky configurations in model architectures, malicious content in ZIP archives, and embedded executables in binary model files.

ModelAudit addresses these unique AI security challenges by providing specialized scanning capabilities designed specifically for machine learning artifacts. This ensures threats are identified before models reach production environments, maintaining the integrity of your AI pipeline.

## Usage

### Basic Command Structure

```bash
promptfoo scan-model [OPTIONS] PATH...
```

### Examples

```bash
# Local models
promptfoo scan-model ./model.pkl
promptfoo scan-model ./models/

# HuggingFace models (no download required)
promptfoo scan-model https://huggingface.co/bert-base-uncased
promptfoo scan-model hf://microsoft/resnet-50

# Cloud storage
promptfoo scan-model s3://my-bucket/model.pt
promptfoo scan-model gs://my-bucket/model.h5

# Advanced sources
promptfoo scan-model https://company.jfrog.io/artifactory/models/model.pkl
promptfoo scan-model model.pkl.dvc  # DVC pointer files
promptfoo scan-model models:/MyModel/1  # MLflow registry

# Output options
promptfoo scan-model model.pkl --format json --output results.json
promptfoo scan-model models/ --sbom compliance-report.json  # Software Bill of Materials
```

:::info Alternative Installation and Usage

- **Standalone**: Install modelaudit directly using `pip install modelaudit`. `modelaudit scan` behaves the same as `promptfoo scan-model`.
- **Web Interface**: For a GUI experience, use `promptfoo view` and navigate to `/model-audit` for visual scanning and configuration.
  :::

For complete CLI options and advanced usage, see **[Usage Guide](./usage.md)**.

## Web Interface

For users who prefer visual interfaces, Promptfoo includes a web-based ModelAudit interface at `/model-audit`. This provides an intuitive alternative to command-line scanning with visual path selection, real-time progress tracking, and detailed results visualization.

**Access:** Run `promptfoo view` and navigate to `http://localhost:15500/model-audit`

**Key Features:**

The web interface streamlines the scanning process with visual file/directory selection, GUI configuration for all scan options, live progress tracking with severity color coding, and automatic scan history management.

## Supported Model Formats

| Format                                                        | Extensions                   | Description                             |
| ------------------------------------------------------------- | ---------------------------- | --------------------------------------- |
| **[PyTorch](./scanners.md#pytorch-zip-scanner)**              | `.pt`, `.pth`, `.bin`        | ZIP archives and raw tensors            |
| **[TensorFlow](./scanners.md#tensorflow-savedmodel-scanner)** | `.pb`, `.tflite`             | SavedModel and TensorFlow Lite formats  |
| **[Keras](./scanners.md#keras-h5-scanner)**                   | `.h5`, `.keras`, `.hdf5`     | Including Lambda layer analysis         |
| **[ONNX](./scanners.md#onnx-scanner)**                        | `.onnx`                      | With custom operator detection          |
| **[SafeTensors](./scanners.md#safetensors-scanner)**          | `.safetensors`               | Safer alternative to pickle             |
| **[GGUF/GGML](./scanners.md#ggufggml-scanner)**               | `.gguf`, `.ggml`             | LLaMA, Alpaca, and quantized LLMs       |
| **[JAX/Flax](./scanners.md#flaxjax-scanner)**                 | `.msgpack`, `.orbax`, `.jax` | JAX ecosystem checkpoints               |
| **[TensorRT](./scanners.md#tensorrt-scanner)**                | `.engine`, `.plan`           | NVIDIA optimized inference engines      |
| **[PMML](./scanners.md#pmml-scanner)**                        | `.pmml`                      | Predictive Model Markup Language        |
| **[Pickle/Joblib](./scanners.md#pickle-scanner)**             | `.pkl`, `.joblib`            | Python serialization formats            |
| **[NumPy](./scanners.md#numpy-scanner)**                      | `.npy`, `.npz`               | Array data with integrity checking      |
| **[ZIP Archives](./scanners.md#zip-archive-scanner)**         | `.zip`                       | Recursive scanning with bomb protection |
| **[Containers](./scanners.md#oci-layer-scanner)**             | `.manifest`                  | OCI/Docker embedded models              |
| **[HuggingFace URLs](./scanners.md#huggingface-url-support)** | `hf://`, `https://`          | Direct model scanning without download  |
| **Cloud Storage**                                             | `s3://`, `gs://`, `r2://`    | S3, GCS, Cloudflare R2 support          |
| **MLflow Registry**                                           | `models://`                  | Model registry integration              |
| **JFrog Artifactory**                                         | `https://`                   | Enterprise artifact repositories        |

For detailed scanner capabilities, see **[Scanner Reference](./scanners.md)**.

## Security Checks Performed

ModelAudit performs comprehensive security analysis across all supported formats:

**Code Execution Risks:**

- **Malicious Code** - Dangerous imports, eval/exec calls, system commands
- **Pickle Exploits** - Unsafe opcodes, serialization attacks, encoded payloads
- **Custom Operations** - Risky TensorFlow operations, ONNX custom operators
- **Lambda Layers** - Arbitrary code in Keras Lambda layers

**Data Integrity:**

- **Format Validation** - File structure integrity, magic byte verification
- **Embedded Threats** - Hidden executables (PE, ELF, Mach-O), scripts
- **Compression Attacks** - Zip bombs, decompression exploits
- **Weight Anomalies** - Statistical analysis for backdoors and trojans

**Compliance & Configuration:**

- **License Detection** - AGPL network service warnings, commercial use restrictions, software bill of materials (SBOM) generation
- **Container Security** - OCI/Docker layer scanning with path traversal attack prevention
- **XML Security** - XXE attack prevention in PMML files
- **Blacklist Matching** - Custom security patterns and known threats

For detailed security capabilities by format, see **[Scanner Reference](./scanners.md)**.

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

## Getting Started

Start with the **[Installation & Quick Start Guide](./installation.md)** to scan your first model in 5 minutes, or explore the **[Usage Guide](./usage.md)** for advanced integrations and CI/CD workflows.
