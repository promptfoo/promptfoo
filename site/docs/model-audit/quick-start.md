---
title: Quick Start - Scan ML Models in 5 Minutes
description: Get ModelAudit running quickly. Scan local models, HuggingFace repos, and cloud storage for security vulnerabilities in under 5 minutes.
keywords:
  [quick start, model scanning, AI security setup, ML security quickstart, modelaudit tutorial]
sidebar_label: Quick Start
sidebar_position: 2
---

# Quick Start

Get ModelAudit running in 5 minutes. This guide covers the most common use cases to help you secure your AI models quickly.

## Installation

### Option 1: Via Promptfoo (Recommended)

```bash
npm install -g promptfoo
pip install modelaudit
```

### Option 2: Standalone

```bash
pip install modelaudit
```

## Your First Scan

### 1. Local Models

Start with models on your local filesystem:

```bash
# Scan a single model file
promptfoo scan-model ./model.pkl

# Scan a directory of models
promptfoo scan-model ./models/

# Scan with JSON output for automation
promptfoo scan-model ./model.pkl --format json --output results.json
```

### 2. HuggingFace Models

Scan models directly from HuggingFace without downloading:

```bash
# Public models
promptfoo scan-model https://huggingface.co/bert-base-uncased
promptfoo scan-model hf://microsoft/resnet-50

# With authentication for private models
export HF_TOKEN=your_token_here
promptfoo scan-model hf://your-org/private-model
```

### 3. Cloud Storage

Scan models from cloud providers:

```bash
# AWS S3 (uses your AWS credentials)
promptfoo scan-model s3://my-bucket/model.pt

# Google Cloud Storage
promptfoo scan-model gs://my-bucket/model.h5

# Cloudflare R2
promptfoo scan-model r2://my-bucket/model.safetensors
```

## Understanding Results

ModelAudit classifies findings by severity:

```bash
✓ Scanning model.pkl
🚨 Found 2 critical, 1 warnings

1. model.pkl (pos 28): [CRITICAL] Suspicious module reference found: os.system
   Why: Direct system access could execute arbitrary commands

2. model.pkl (pos 71): [WARNING] Found REDUCE opcode - potential code execution
```

**Severity Levels:**

- 🚨 **CRITICAL**: Immediate security concerns - investigate immediately
- ⚠️ **WARNING**: Potential issues - review and assess risk
- ℹ️ **INFO**: Informational findings - good to know
- 🔍 **DEBUG**: Detailed analysis (shown with `--verbose`)

## Common Options

```bash
# Verbose output for detailed analysis
promptfoo scan-model model.pkl --verbose

# Set file size limits for large models
promptfoo scan-model models/ --max-file-size 1073741824  # 1GB limit

# Add custom security patterns
promptfoo scan-model model.pkl --blacklist "unsafe_pattern" --blacklist "malicious_net"

# Generate compliance report
promptfoo scan-model models/ --sbom compliance-report.json
```

## Exit Codes for Automation

```bash
# Check the exit code in scripts
promptfoo scan-model model.pkl
echo "Exit code: $?"

# 0 = Clean (no issues found)
# 1 = Issues found (warnings or critical findings)
# 2 = Scan errors (file not found, permission denied, etc.)
```

## Web Interface

For a visual experience, use the web interface:

```bash
promptfoo view
# Navigate to http://localhost:15500/model-audit
```

**Features:**

- Visual file selection with drag-and-drop
- Real-time scan progress
- Interactive results with severity filtering
- Scan history and export options

## Next Steps

### For Basic Usage

- **[Installation Guide](./installation.md)** - Detailed setup for all model formats
- **[Usage Guide](./usage.md)** - Core scanning workflows and configuration

### Advanced Features

- **[Complete Usage Guide](./usage.md)** - All CLI options and integrations
- **[Scanner Reference](./scanners.md)** - Deep dive into security checks
- **[Installation Guide](./installation.md)** - Dependencies and authentication

## Common Issues

**Missing dependencies:** `pip install tensorflow h5py torch onnx`

**File not found:** Check file exists with `ls -la model.pkl`

**Need help:** See **[Installation Guide](./installation.md)** for troubleshooting

---

🎯 **Goal**: In 5 minutes, you should be able to scan your first model and understand the security findings. The guides linked above provide deeper details for specific use cases.
