---
sidebar_label: Scanners
sidebar_position: 200
---

# ModelAudit Scanners

ModelAudit includes specialized scanners for different model formats and file types. Each scanner is designed to identify specific security issues relevant to that format.

## Pickle Scanner

**File types:** `.pkl`, `.pickle`, `.bin` (when containing pickle data)

The Pickle Scanner analyzes Python pickle files for security risks, which are common in many ML frameworks. It also detects pickle-formatted `.bin` files.

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

## PyTorch Binary Scanner

**File types:** `.bin` (raw PyTorch tensor files)

This scanner examines raw PyTorch binary tensor files that contain serialized weight data.

**What it checks for:**

- Embedded code patterns (imports, function calls, eval/exec)
- Executable file signatures (Windows PE, Linux ELF, macOS Mach-O)
- Shell script shebangs that might indicate embedded scripts
- Blacklisted patterns specified in configuration
- Suspiciously small files that might not be valid tensor data
- Validation of tensor structure

**Why it matters:**
While `.bin` files typically contain raw tensor data, attackers could embed malicious code or executables within these files. The scanner performs deep content analysis to detect such threats.

## ZIP Archive Scanner

**File types:** `.zip`

This scanner examines ZIP archives and their contents recursively.

**What it checks for:**

- **Directory traversal attacks:** Detects entries with paths containing ".." or absolute paths that could overwrite system files
- **Zip bombs:** Identifies files with suspicious compression ratios (>100x) that could cause resource exhaustion
- **Nested archives:** Scans ZIP files within ZIP files up to a configurable depth to prevent infinite recursion attacks
- **Malicious content:** Each file within the archive is scanned with its appropriate scanner (e.g., pickle files with PickleScanner)
- **Resource limits:** Enforces maximum number of entries and file sizes to prevent denial of service

**Why it matters:**
ZIP archives are commonly used to distribute models and datasets. Malicious actors can craft ZIP files that exploit extraction vulnerabilities, contain malware, or cause resource exhaustion. This scanner ensures that archives are safe to extract and that their contents don't pose security risks.

## Weight Distribution Scanner

**File types:** `.pt`, `.pth`, `.h5`, `.keras`, `.hdf5`, `.pb`, `.onnx`, `.safetensors`

This scanner analyzes neural network weight distributions to detect potential backdoors or trojaned models by identifying statistical anomalies.

**What it checks for:**

- **Outlier neurons:** Detects output neurons with abnormally high weight magnitudes using Z-score analysis
- **Dissimilar weight vectors:** Identifies neurons whose weight patterns are significantly different from others in the same layer (using cosine similarity)
- **Extreme weight values:** Flags neurons containing unusually large individual weight values that deviate from the layer's distribution
- **Final layer focus:** Prioritizes analysis of classification heads and output layers where backdoors are typically implemented

**Configuration options:**

- `z_score_threshold`: Controls sensitivity for outlier detection (default: 3.0, higher for LLMs)
- `cosine_similarity_threshold`: Minimum similarity required between neurons (default: 0.7)
- `weight_magnitude_threshold`: Threshold for extreme weight detection (default: 3.0 standard deviations)
- `llm_vocab_threshold`: Vocabulary size threshold to identify LLM models (default: 10,000)
- `enable_llm_checks`: Whether to perform checks on large language models (default: false)

**Why it matters:**
Backdoored or trojaned models often contain specific neurons that activate on trigger inputs. These malicious neurons typically have weight patterns that are statistically anomalous compared to benign neurons. By analyzing weight distributions, this scanner can detect models that have been tampered with to include hidden behaviors.

**Special handling for LLMs:**
Large language models with vocabulary layers (>10,000 outputs) use more conservative thresholds to reduce false positives, as their weight distributions naturally have more variation. LLM checking is disabled by default but can be enabled via configuration.

## Auto Format Detection

ModelAudit includes file format detection for `.bin` files, which can contain different types of model data:

- **Pickle format**: Detected by pickle protocol magic bytes
- **Safetensors format**: Detected by JSON header structure
- **ONNX format**: Detected by ONNX protobuf signatures
- **Raw PyTorch tensors**: Default for `.bin` files without other signatures

This allows ModelAudit to automatically apply the correct scanner based on the actual file content, not just the extension.
