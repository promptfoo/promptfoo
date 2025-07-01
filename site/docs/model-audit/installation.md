---
title: Installation & Quick Start
description: Install ModelAudit and scan your first model in 5 minutes.
keywords:
  [modelaudit installation, quick start, AI security setup, ML model scanner setup, dependencies]
sidebar_label: Installation
sidebar_position: 2
---

# Installation & Quick Start

Get ModelAudit running and scan your first model in 5 minutes.

## System Requirements

- **Python**: 3.9 or higher
- **Memory**: 1GB+ RAM (more for large models)
- **Storage**: 500MB+ free space
- **Network**: Internet access for remote scanning (optional)
- **Platforms**: Linux, macOS, Windows, Docker

## Installation

### Recommended: Via Promptfoo

```bash
npm install -g promptfoo
pip install modelaudit
```

### Alternative Methods

<details>
<summary>Standalone Installation</summary>

```bash
# Basic installation
pip install modelaudit

# With all optional dependencies
pip install modelaudit[all]

# Use modelaudit command instead of promptfoo scan-model
modelaudit scan model.pkl
```

</details>

<details>
<summary>Docker Installation</summary>

```bash
# Pull and run
docker pull ghcr.io/promptfoo/modelaudit:latest
docker run --rm -v $(pwd):/data ghcr.io/promptfoo/modelaudit:latest scan /data/model.pkl

# Available variants
docker pull ghcr.io/promptfoo/modelaudit:latest-full        # All ML frameworks
docker pull ghcr.io/promptfoo/modelaudit:latest-tensorflow  # TensorFlow only
```

</details>

<details>
<summary>Development Installation</summary>

```bash
git clone https://github.com/promptfoo/modelaudit.git
cd modelaudit
pip install -e .[all]
```

</details>

## Scan Your First Model

```bash
# Local file
promptfoo scan-model ./model.pkl

# Directory of models
promptfoo scan-model ./models/

# Remote model (no download required)
promptfoo scan-model hf://microsoft/resnet-50
```

### Understanding Results

```bash
✓ Scanning model.pkl
🚨 Found 2 critical, 1 warning

1. model.pkl (pos 28): [CRITICAL] Suspicious module reference found: os.system
   Why: Direct system access could execute arbitrary commands

2. model.pkl (pos 71): [WARNING] Found REDUCE opcode - potential code execution
```

**Severity Levels:**

- 🚨 **CRITICAL**: Immediate security concerns
- ⚠️ **WARNING**: Potential issues to review
- ℹ️ **INFO**: Informational findings
- 🔍 **DEBUG**: Detailed analysis with `--verbose`

**Exit Codes:**

- `0` = Clean (no issues found)
- `1` = Issues found (warnings or critical)
- `2` = Scan errors (file not found, etc.)

## Dependencies

ModelAudit uses a modular dependency system. Core scanning works out of the box, with optional packages for specific formats:

| Format                        | Required Package                | Install Command                       |
| ----------------------------- | ------------------------------- | ------------------------------------- |
| Pickle, ZIP, GGUF/GGML, NumPy | Built-in                        | (included)                            |
| TensorFlow/TFLite             | `tensorflow`                    | `pip install modelaudit[tensorflow]`  |
| Keras H5                      | `h5py`, `tensorflow`            | `pip install modelaudit[h5]`          |
| PyTorch (weight analysis)     | `torch`                         | `pip install modelaudit[pytorch]`     |
| ONNX                          | `onnx`                          | `pip install modelaudit[onnx]`        |
| SafeTensors                   | `safetensors`                   | `pip install modelaudit[safetensors]` |
| JAX/Flax                      | `msgpack`                       | `pip install modelaudit[flax]`        |
| Joblib                        | `joblib`                        | `pip install modelaudit[joblib]`      |
| HuggingFace URLs              | `huggingface-hub`               | `pip install modelaudit[huggingface]` |
| Cloud Storage                 | `boto3`, `google-cloud-storage` | `pip install modelaudit[cloud]`       |
| All formats                   | All above                       | `pip install modelaudit[all]`         |

### NumPy Compatibility

ModelAudit supports both NumPy 1.x and 2.x:

```bash
# Check which scanners loaded
modelaudit doctor --show-failed

# Force NumPy 1.x if needed
pip install modelaudit[numpy1]
```

## Verification

Test your installation:

```bash
# Quick test
echo "test" > test.txt && promptfoo scan-model test.txt

# Check available scanners
modelaudit doctor

# Test with a pickle file
python -c "import pickle; pickle.dump({'test': 'data'}, open('test.pkl', 'wb'))"
promptfoo scan-model test.pkl
```

## Troubleshooting

<details>
<summary>Common Issues & Solutions</summary>

**Missing Dependencies:**

```bash
pip install h5py tensorflow  # For Keras files
pip install msgpack          # For JAX/Flax files
```

**Permission Issues:**

```bash
# Use virtual environment
python -m venv modelaudit-env
source modelaudit-env/bin/activate  # Linux/Mac
pip install modelaudit[all]
```

**Docker Volume Issues:**

```bash
# Linux/Mac
docker run --rm -v "$(pwd)":/data ghcr.io/promptfoo/modelaudit:latest scan /data/

# Windows PowerShell
docker run --rm -v "${PWD}:/data" ghcr.io/promptfoo/modelaudit:latest scan /data/
```

</details>

## Next Steps

- **[Usage Guide](./usage.md)** - Remote scanning, CLI options, integrations
- **[Scanner Reference](./scanners.md)** - Detailed scanner capabilities
- **[Examples Repository](https://github.com/promptfoo/modelaudit-examples)** - CI/CD templates and configurations
