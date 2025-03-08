---
sidebar_label: Scanners
sidebar_position: 200
---

# ModelAudit Scanners

ModelAudit includes specialized scanners for different model formats and file types. Each scanner is designed to identify specific security issues relevant to that format.

## Pickle Scanner

**File types:** `.pkl`, `.pickle`

The Pickle Scanner analyzes Python pickle files for security risks, which are common in many ML frameworks.

**What it checks for:**

- Suspicious module imports (e.g., `os`, `subprocess`, `sys`)
- Potentially dangerous functions (e.g., `eval`, `exec`, `system`)
- Malicious serialization patterns often used in pickle exploits
- Encoded payloads that might contain hidden code
- Suspicious string patterns that could indicate code injection

**Why it matters:**
Pickle files are a common serialization format for ML models but can execute arbitrary code during unpickling. Attackers can craft malicious pickle files that execute harmful commands when loaded.

## TensorFlow SavedModel Scanner

**File types:** `.pb` files and SavedModel directories

This scanner examines TensorFlow models saved in the SavedModel format.

**What it checks for:**

- Suspicious TensorFlow operations that could access files or the system
- Potentially harmful Python function calls embedded in the graph
- Operations that allow arbitrary code execution (e.g., `PyFunc`)
- File I/O operations that might read from or write to unexpected locations
- Execution operations that could run system commands

**Why it matters:**
TensorFlow models can contain operations that interact with the filesystem or execute arbitrary code, which could be exploited if a malicious model is loaded.

## Keras H5 Scanner

**File types:** `.h5`, `.hdf5`, `.keras`

This scanner analyzes Keras models stored in HDF5 format.

**What it checks for:**

- Potentially unsafe Lambda layers that could contain arbitrary Python code
- Suspicious layer configurations with embedded code
- Custom layers or metrics that might execute malicious code
- Dangerous string patterns in model configurations

**Why it matters:**
Keras models with Lambda layers can contain arbitrary Python code that executes when the model is loaded or run. This could be exploited to execute malicious code on the host system.

## PyTorch Zip Scanner

**File types:** `.pt`, `.pth`

This scanner examines PyTorch model files, which are ZIP archives containing pickled data.

**What it checks for:**

- Malicious pickle files embedded within the PyTorch model
- Python code files included in the model archive
- Executable scripts or binaries bundled with the model
- Suspicious serialization patterns in the embedded pickles

**Why it matters:**
PyTorch models are essentially ZIP archives containing pickled objects, which can include malicious code. The scanner unpacks these archives and applies pickle security checks to the contents.

## Manifest Scanner

**File types:** `.json`, `.yaml`, `.yml`, `.xml`, `.toml`, `.config`, etc.

This scanner analyzes model configuration files and manifests.

**What it checks for:**

- Blacklisted model names that might indicate known vulnerable models
- Suspicious configuration patterns related to:
  - Network access (URLs, endpoints, webhooks)
  - File system access (paths, directories, file operations)
  - Code execution (commands, scripts, shell access)
  - Credentials (passwords, tokens, secrets)

**Why it matters:**
Model configuration files can contain settings that lead to insecure behavior, such as downloading content from untrusted sources, accessing sensitive files, or executing commands.
