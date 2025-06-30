---
title: Installation Guide - ModelAudit Setup and Dependencies
description: Complete installation guide for ModelAudit including dependencies for TensorFlow, PyTorch, ONNX, cloud storage, and authentication setup.
keywords:
  [modelaudit installation, AI security setup, ML model scanner setup, dependencies, authentication]
sidebar_label: Installation
sidebar_position: 3
---

# Installation

This guide covers all installation methods and dependencies for ModelAudit. Choose the method that best fits your setup.

## Installation Methods

### Via Promptfoo (Recommended)

For most users, installing via Promptfoo provides the best experience with web interface integration:

```bash
# Install Promptfoo
npm install -g promptfoo

# Install ModelAudit
pip install modelaudit

# Verify installation
promptfoo scan-model --help
```

### Standalone Installation

Install ModelAudit directly for command-line use:

```bash
# Basic installation
pip install modelaudit

# With all optional dependencies
pip install modelaudit[all]

# Verify installation
modelaudit scan --help
```

### Docker Installation

Use Docker for isolated environments:

```bash
# Pull from GitHub Container Registry
docker pull ghcr.io/promptfoo/modelaudit:latest

# Run with Docker
docker run --rm -v $(pwd):/data ghcr.io/promptfoo/modelaudit:latest scan /data/model.pkl

# Available variants
docker pull ghcr.io/promptfoo/modelaudit:latest-full        # All ML frameworks
docker pull ghcr.io/promptfoo/modelaudit:latest-tensorflow  # TensorFlow only
```

## Dependencies by Model Format

ModelAudit has different dependency requirements based on which model formats you need to scan:

### Core Dependencies (Always Installed)

```bash
# These are included with basic installation
# - Pickle files (.pkl, .pickle, .bin, .ckpt)
# - GGUF/GGML files (.gguf, .ggml)
# - NumPy arrays (.npy, .npz)
# - ZIP archives (.zip)
# - PMML files (.pmml)
# - TensorRT engines (.engine, .plan)
# - PyTorch binary files (.bin)
# - Manifest files (.json, .yaml, etc.)
```

### Optional Dependencies

Install these for specific model formats:

```bash
# TensorFlow models
pip install modelaudit[tensorflow]
# Provides: SavedModel (.pb), TensorFlow Lite (.tflite)

# Keras models
pip install modelaudit[h5]
# Provides: HDF5 format (.h5, .hdf5, .keras)

# PyTorch models (for weight analysis)
pip install modelaudit[pytorch]
# Provides: Advanced PyTorch model analysis

# ONNX models
pip install modelaudit[onnx]
# Provides: ONNX format (.onnx) validation

# SafeTensors models
pip install modelaudit[safetensors]
# Provides: SafeTensors format (.safetensors)

# YAML manifest scanning
pip install modelaudit[yaml]
# Provides: Enhanced YAML configuration file scanning

# Flax/JAX models
pip install modelaudit[flax]
# Provides: MessagePack format (.msgpack, .flax, .orbax)

# Joblib models
pip install modelaudit[joblib]
# Provides: Joblib serialization (.joblib)
```

### Integration Dependencies

For advanced integrations:

```bash
# HuggingFace URL scanning
pip install modelaudit[huggingface]
# Enables: hf:// URLs, private model access

# Cloud storage support
pip install modelaudit[cloud]
# Enables: S3, GCS, Cloudflare R2 scanning

# MLflow integration
pip install modelaudit[mlflow]
# Enables: models:// URI scanning

# All dependencies
pip install modelaudit[all]
# Installs everything above
```

## NumPy Compatibility

ModelAudit supports both NumPy 1.x and 2.x with automatic graceful fallback:

```bash
# Default installation (works with NumPy 2.x)
pip install modelaudit[all]

# Full NumPy 1.x compatibility (ensures all ML frameworks work)
pip install modelaudit[numpy1]

# Check scanner compatibility
modelaudit doctor --show-failed
```

**NumPy 2.x Notes:**

- Some ML framework scanners may not load due to compatibility issues
- Core scanning functionality works perfectly
- Use `modelaudit doctor` to see which scanners loaded successfully

## Development Installation

For contributing to ModelAudit:

```bash
# Clone the repository
git clone https://github.com/promptfoo/modelaudit.git
cd modelaudit

# Using Rye (recommended)
rye sync --features all

# Or using pip
pip install -e .[all]

# Run tests
pytest tests/
```

## Verification

Test your installation:

```bash
# Basic functionality test
echo "test content" > test_file.txt
modelaudit scan test_file.txt

# Check available scanners
modelaudit doctor

# Test specific format (if you have dependencies installed)
# Create a simple pickle file for testing
python -c "import pickle; pickle.dump({'test': 'data'}, open('test.pkl', 'wb'))"
modelaudit scan test.pkl
```

## Authentication Setup

### HuggingFace

```bash
# For private models or higher rate limits
export HF_TOKEN=your_token_here
# Or any of: HF_API_TOKEN, HUGGING_FACE_HUB_TOKEN
```

### Cloud Storage

**AWS S3:**

```bash
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_DEFAULT_REGION=us-east-1

# Or use ~/.aws/credentials file
# Or IAM roles (automatic on EC2/Lambda)
```

**Google Cloud Storage:**

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# Or use gcloud authentication
gcloud auth application-default login
```

**Cloudflare R2:**

```bash
export AWS_ACCESS_KEY_ID=your_r2_access_key
export AWS_SECRET_ACCESS_KEY=your_r2_secret_key
export AWS_ENDPOINT_URL=https://your-account.r2.cloudflarestorage.com
```

### MLflow

```bash
export MLFLOW_TRACKING_URI=http://your-mlflow-server:5000
```

### JFrog Artifactory

```bash
export JFROG_API_TOKEN=your_api_token
# Or: JFROG_ACCESS_TOKEN

# Or create .env file
echo "JFROG_API_TOKEN=your_token" > .env
```

## Troubleshooting

### Common Issues

**Missing Dependencies:**

```bash
# Error: h5py not installed
pip install h5py tensorflow

# Error: msgpack not installed
pip install msgpack
```

**Scanner Loading Issues:**

```bash
# Check which scanners loaded
modelaudit doctor --show-failed

# For NumPy compatibility issues
pip install "numpy<2.0" --force-reinstall
```

**Permission Issues:**

```bash
# On some systems, use --user flag
pip install --user modelaudit[all]

# Or use virtual environment
python -m venv modelaudit-env
source modelaudit-env/bin/activate  # Linux/Mac
# modelaudit-env\Scripts\activate   # Windows
pip install modelaudit[all]
```

**Docker Issues:**

```bash
# Ensure proper volume mounting for file access
docker run --rm -v "$(pwd)":/data ghcr.io/promptfoo/modelaudit:latest scan /data/

# For Windows PowerShell
docker run --rm -v "${PWD}:/data" ghcr.io/promptfoo/modelaudit:latest scan /data/
```

## Next Steps

- **[Quick Start](./quick-start.md)** - Get scanning in 5 minutes
- **[Usage Guide](./usage.md)** - Detailed usage patterns and configuration
- **[Scanner Reference](./scanners.md)** - Understanding what each scanner does

## System Requirements

- **Python**: 3.9 or higher
- **Memory**: 1GB+ RAM (more for large models)
- **Storage**: 500MB+ free space (for temporary model downloads)
- **Network**: Internet access for remote model scanning (HuggingFace, cloud storage, etc.)

**Platform Support:**

- ✅ Linux (x86_64, ARM64)
- ✅ macOS (Intel, Apple Silicon)
- ✅ Windows (x86_64)
- ✅ Docker containers
