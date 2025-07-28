---
description: Complete guide to ModelAudit's security scanners for different ML model formats including PyTorch, TensorFlow, Keras, ONNX, GGUF, and more.
keywords:
  [
    modelaudit,
    model security,
    AI security,
    ML security scanning,
    pickle scanner,
    pytorch security,
    tensorflow security,
    keras security,
    onnx security,
    model vulnerability detection,
    malicious code detection,
    backdoor detection,
    model file scanning,
  ]
sidebar_label: Scanners
sidebar_position: 200
---

# ModelAudit Scanners

ModelAudit includes specialized scanners for different model formats and file types. Each scanner is designed to identify specific security issues relevant to that format.

## Pickle Scanner

**File types:** `.pkl`, `.pickle`, `.dill`, `.bin` (when containing pickle data), `.pt`, `.pth`, `.ckpt`

The Pickle Scanner analyzes Python pickle files for security risks, which are common in many ML frameworks. It supports standard pickle files as well as dill-serialized files (an extended pickle format).

**Key checks:**

- Suspicious module imports (e.g., `os`, `subprocess`, `sys`)
- Dangerous functions (e.g., `eval`, `exec`, `system`)
- Malicious pickle opcodes (REDUCE, INST, OBJ, NEWOBJ, STACK_GLOBAL)
- Encoded payloads and suspicious string patterns
- Embedded executables in binary content
- ML context detection to reduce false positives

**Why it matters:**
Pickle files are a common serialization format for ML models but can execute arbitrary code during unpickling. Attackers can craft malicious pickle files that execute harmful commands when loaded.

## TensorFlow SavedModel Scanner

**File types:** `.pb` files and SavedModel directories

This scanner examines TensorFlow models saved in the SavedModel format.

**Key checks:**

- Suspicious TensorFlow operations that could access files or the system
- Python function calls embedded in the graph
- Operations that allow arbitrary code execution (e.g., `PyFunc`)
- File I/O operations that might access unexpected locations
- Execution operations that could run system commands

**Why it matters:**
TensorFlow models can contain operations that interact with the filesystem or execute arbitrary code, which could be exploited if a malicious model is loaded.

## TensorFlow Lite Scanner

**File types:** `.tflite`

This scanner examines TensorFlow Lite model files, which are optimized for mobile and embedded devices.

**Key checks:**

- Custom operations that could contain malicious code
- Flex delegate operations that enable full TensorFlow ops execution
- Model metadata that could contain executable content
- Suspicious operator configurations or patterns
- Buffer validation to detect tampering

**Why it matters:**
While TensorFlow Lite models are generally safer than full TensorFlow models due to their limited operator set, they can still include custom operations or use the Flex delegate to access the full TensorFlow runtime, potentially introducing security risks. Malicious actors could embed harmful code in custom ops or metadata.

## TensorRT Scanner

**File types:** `.engine`, `.plan`

This scanner examines NVIDIA TensorRT engine files, which are optimized inference engines for NVIDIA GPUs.

**Key checks:**

- Suspicious file paths (`/tmp/`, `../`) that might indicate unauthorized access
- Embedded shared library references (`.so` files) that could contain malicious code
- Script execution patterns (`exec`, `eval`) that could run arbitrary code
- Unauthorized plugin references that might load malicious extensions

**Why it matters:**
TensorRT engines can contain custom plugins and operations. While generally safer than pickle files, they could be crafted to include malicious plugins or reference unauthorized system resources.

## Keras H5 Scanner

**File types:** `.h5`, `.hdf5`, `.keras`

This scanner analyzes Keras models stored in HDF5 format.

**Key checks:**

- Unsafe Lambda layers that could contain arbitrary Python code
- Suspicious layer configurations with embedded code
- Custom layers or metrics that might execute malicious code
- Dangerous string patterns in model configurations

**Why it matters:**
Keras models with Lambda layers can contain arbitrary Python code that executes when the model is loaded or run. This could be exploited to execute malicious code on the host system.

## ONNX Scanner

**File types:** `.onnx`

This scanner examines ONNX (Open Neural Network Exchange) model files for security issues and integrity problems.

**Key checks:**

- Custom operators that might contain malicious functionality
- External data file references and path traversal attempts
- Tensor size and data integrity validation
- File size mismatches that could indicate tampering

**Why it matters:**
ONNX models can reference external data files and custom operators. Malicious actors could exploit these features to include harmful custom operations or manipulate external data references to access unauthorized files on the system.

## PyTorch Zip Scanner

**File types:** `.pt`, `.pth`

This scanner examines PyTorch model files, which are ZIP archives containing pickled data.

**Key checks:**

- Malicious pickle files embedded within the PyTorch model
- Python code files included in the model archive
- Executable scripts or binaries bundled with the model
- Suspicious serialization patterns in the embedded pickles

**Why it matters:**
PyTorch models are essentially ZIP archives containing pickled objects, which can include malicious code. The scanner unpacks these archives and applies pickle security checks to the contents.

## GGUF/GGML Scanner

**File types:** `.gguf`, `.ggml`, `.ggmf`, `.ggjt`, `.ggla`, `.ggsa`

This scanner validates GGUF (GPT-Generated Unified Format) and GGML model files commonly used for large language models like LLaMA, Alpaca, and other quantized models.

**Key checks:**

- **Header validation**: Verifies file format integrity and header structure
- **Metadata security**: Scans JSON metadata for suspicious content and path traversal attempts
- **Tensor integrity**: Validates tensor dimensions, types, and data alignment
- **Resource limits**: Enforces security limits to prevent denial-of-service attacks
- **Compression validation**: Checks for reasonable tensor sizes and prevents decompression bombs

**Why it matters:**
GGUF/GGML files are increasingly popular for distributing large language models. While generally safer than pickle formats, they can still contain malicious metadata or be crafted to cause resource exhaustion attacks. The scanner ensures these files are structurally sound and don't contain hidden threats.

## Joblib Scanner

**File types:** `.joblib`

This scanner analyzes joblib serialized files, which are commonly used by ML libraries for model persistence.

**Key checks:**

- **Compression bomb detection**: Identifies files with suspicious compression ratios that could cause resource exhaustion
- **Embedded pickle analysis**: Decompresses and scans embedded pickle content for malicious code
- **Size limits**: Enforces maximum decompressed size limits to prevent memory exhaustion
- **Format validation**: Distinguishes between ZIP archives and compressed pickle data

**Why it matters:**
Joblib files often contain compressed pickle data, inheriting the same security risks as pickle files. Additionally, malicious actors could craft compression bombs that consume excessive memory or CPU resources when loaded. The scanner provides safe decompression with security limits.

## Flax/JAX Scanner

**File types:** `.msgpack`, `.flax`, `.orbax`, `.jax`

This scanner analyzes Flax/JAX model files serialized in MessagePack format and other JAX-specific formats.

**Key checks:**

- Suspicious MessagePack structures that could exploit deserializers
- Embedded code objects or executable content
- Malformed or oversized data structures that could cause resource exhaustion
- Potentially dangerous nested objects or recursive structures
- Unusual data types that might indicate tampering

**Why it matters:**
Flax models serialized as msgpack files can potentially contain embedded code or malicious data structures. While MessagePack is generally safer than pickle, it can still be exploited through carefully crafted payloads that target specific deserializer vulnerabilities or cause denial-of-service attacks through resource exhaustion.

## JAX Checkpoint Scanner

**File types:** `.ckpt`, `.checkpoint`, `.orbax-checkpoint`, `.pickle` (when in JAX context)

This scanner analyzes JAX checkpoint files in various serialization formats, including Orbax checkpoints and JAX-specific pickle files.

**Key checks:**

- Dangerous JAX operations like experimental callbacks (`jax.experimental.host_callback.call`)
- Custom restore functions in Orbax checkpoint metadata
- Dangerous pickle opcodes in JAX-serialized files
- Directory-based checkpoint structure validation
- Resource limits to prevent denial-of-service attacks

**Why it matters:**
JAX checkpoints can contain custom restore functions or experimental callbacks that could be exploited. Orbax checkpoints may include metadata with arbitrary restore functions that execute during model loading.

## NumPy Scanner

**File types:** `.npy`, `.npz`

This scanner validates NumPy binary array files for integrity issues and potential security risks.

**Key checks:**

- **Array validation**: Checks array dimensions and data types for malicious manipulation
- **Header integrity**: Validates NumPy file headers and magic numbers
- **Dangerous data types**: Detects potentially harmful data types like object arrays
- **Size validation**: Prevents loading of excessively large arrays that could cause memory exhaustion
- **Dimension limits**: Enforces reasonable limits on array dimensions to prevent DoS attacks

**Why it matters:**
While NumPy files are generally safer than pickle files, they can still be crafted maliciously. Object arrays can contain arbitrary Python objects (including code), and extremely large arrays can cause denial-of-service attacks. The scanner ensures arrays are safe to load and don't contain hidden threats.

## OCI Layer Scanner

**File types:** `.manifest` (with `.tar.gz` layer references)

This scanner examines OCI (Open Container Initiative) and Docker manifest files that contain embedded model files in compressed layers.

**Key checks:**

- **Layer extraction**: Safely extracts and scans model files from `.tar.gz` layers
- **Manifest validation**: Parses JSON and YAML manifest formats
- **Recursive scanning**: Applies appropriate scanners to model files found within container layers
- **Path validation**: Prevents directory traversal attacks during layer extraction

**Why it matters:**
Container images are increasingly used to distribute ML models and datasets. These containers can contain multiple layers with various file types, potentially hiding malicious models within what appears to be a legitimate container image. The scanner ensures that all model files within container layers are safe.

## Manifest Scanner

**File types:** `.json`, `.yaml`, `.yml`, `.xml`, `.toml`, `.config`, etc.

This scanner analyzes model configuration files and manifests.

**Key checks:**

- Blacklisted model names that might indicate known vulnerable models
- Suspicious configuration patterns related to:
  - Network access (URLs, endpoints, webhooks)
  - File system access (paths, directories, file operations)
  - Code execution (commands, scripts, shell access)
  - Credentials (passwords, tokens, secrets)
- Framework-specific patterns in popular ML library configurations

**Why it matters:**
Model configuration files can contain settings that lead to insecure behavior, such as downloading content from untrusted sources, accessing sensitive files, or executing commands.

## PyTorch Binary Scanner

**File types:** `.bin` (raw PyTorch tensor files)

This scanner examines raw PyTorch binary tensor files that contain serialized weight data. It performs binary content scanning to detect various threats.

**Key checks:**

- Embedded code patterns (imports, function calls, eval/exec)
- Executable file signatures (Windows PE with DOS stub validation, Linux ELF, macOS Mach-O)
- Shell script shebangs that might indicate embedded scripts
- Blacklisted patterns specified in configuration
- Suspiciously small files that might not be valid tensor data
- Validation of tensor structure
- PE file detection with MS-DOS stub signature validation

**Why it matters:**
While `.bin` files typically contain raw tensor data, attackers could embed malicious code or executables within these files. The scanner performs deep content analysis with PE file detection (including DOS stub validation) to detect such threats.

## ZIP Archive Scanner

**File types:** `.zip`, `.npz`

This scanner examines ZIP archives and their contents recursively.

**Key checks:**

- **Directory traversal attacks:** Detects entries with paths containing ".." or absolute paths that could overwrite system files
- **Zip bombs:** Identifies files with suspicious compression ratios (>100x) that could cause resource exhaustion
- **Nested archives:** Scans ZIP files within ZIP files up to a configurable depth to prevent infinite recursion attacks
- **Malicious content:** Each file within the archive is scanned with its appropriate scanner (e.g., pickle files with PickleScanner)
- **Resource limits:** Enforces maximum number of entries and file sizes to prevent denial-of-service attacks

**Why it matters:**
ZIP archives are commonly used to distribute models and datasets. Malicious actors can craft ZIP files that exploit extraction vulnerabilities, contain malware, or cause resource exhaustion. This scanner ensures that archives are safe to extract and that their contents don't pose security risks.

## Weight Distribution Scanner

**File types:** `.pt`, `.pth`, `.h5`, `.keras`, `.hdf5`, `.pb`, `.onnx`, `.safetensors`

This scanner analyzes neural network weight distributions to detect potential backdoors or trojaned models by identifying statistical anomalies.

**Key checks:**

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
Large language models with vocabulary layers (>10,000 outputs) use more conservative thresholds due to their naturally varied weight distributions. LLM checking is disabled by default but can be enabled via configuration.

## SafeTensors Scanner

**File types:** `.safetensors`, `.bin` (when containing SafeTensors data)

This scanner examines SafeTensors format files, which are designed to be a safer alternative to pickle files.

**Key checks:**

- **Header validation**: Verifies SafeTensors format structure and JSON header integrity
- **Metadata security**: Scans metadata for suspicious content, encoded payloads, and unusually large sections
- **Tensor validation**: Validates tensor offsets, sizes, and data type consistency
- **Offset integrity**: Ensures tensor data offsets are contiguous and within file bounds

**Why it matters:**
While SafeTensors is designed to be safer than pickle files, the metadata section can still contain malicious content. Attackers might try to exploit parsers or include encoded payloads in the metadata. The scanner ensures the format integrity and metadata safety.

## PMML Scanner

**File types:** `.pmml`

This scanner performs security checks on PMML (Predictive Model Markup Language) files to detect potential XML External Entity (XXE) attacks, malicious scripts, and suspicious external references.

**Key checks:**

- **XXE Attack Prevention**: Detects `<!DOCTYPE`, `<!ENTITY`, `<!ELEMENT`, and `<!ATTLIST` declarations that could enable XML External Entity attacks
- **Safe XML Parsing**: Uses defusedxml when available for secure XML parsing; warns when using unsafe parsers
- **Malicious Content Detection**: Scans for suspicious patterns like `<script>`, `eval()`, `exec()`, system commands, and imports
- **External Resource References**: Identifies suspicious URLs (HTTP, HTTPS, FTP, file://) in model content
- **PMML Structure Validation**: Validates PMML version and root element structure
- **Extension Element Analysis**: Performs deep inspection of `<Extension>` elements which can contain arbitrary content

**Security features:**

- **XML Security**: Uses defusedxml library when available to prevent XXE and billion laughs attacks
- **Content Scanning**: Recursive analysis of all element text content and attributes for malicious patterns
- **Well-formedness Validation**: Ensures XML structure integrity and UTF-8 encoding compliance

**Why it matters:**
PMML files are XML-based and can be exploited through XML vulnerabilities like XXE attacks. Extension elements can contain arbitrary content that might execute scripts or access external resources. The scanner ensures PMML files don't contain hidden security threats while maintaining model functionality.

## Auto Format Detection

ModelAudit includes comprehensive file format detection for ambiguous file extensions, particularly `.bin` files, which can contain different types of model data:

- **Pickle format**: Detected by pickle protocol magic bytes (\x80\x02, \x80\x03, etc.)
- **SafeTensors format**: Detected by JSON header structure and metadata patterns
- **ONNX format**: Detected by ONNX protobuf signatures
- **PyTorch ZIP format**: Detected by ZIP magic bytes (PK headers)
- **Raw PyTorch tensors**: Default for `.bin` files without other recognizable signatures

**Detection Features:**

- **Magic byte analysis**: Reads file headers to determine actual format regardless of extension
- **Content-based routing**: Automatically applies the most appropriate scanner based on detected format
- **Multi-format support**: Handles cases where files might be misnamed or have generic extensions
- **Fallback handling**: Gracefully handles unknown formats with generic binary scanning

This allows ModelAudit to automatically apply the correct scanner based on the actual file content, not just the extension. When a `.bin` file contains SafeTensors data, the SafeTensors scanner is automatically applied instead of assuming it's a raw binary file.

## License Checking and Compliance

ModelAudit includes license detection across all file formats to help organizations identify legal obligations before deployment.

**Key features:**

- **License Detection**: Scans headers, LICENSE files, and metadata for license information
- **AGPL Warnings**: Alerts about network copyleft obligations
- **Commercial Restrictions**: Identifies non-commercial licenses
- **Unlicensed Content**: Flags large datasets without clear licensing
- **SBOM Generation**: Creates CycloneDX-compliant Software Bill of Materials

**Example warnings:**

```text
⚠️ AGPL license detected: Component is under AGPL-3.0
   This may require source code disclosure if used in network services

🚨 Non-commercial license detected: Creative Commons NonCommercial
   This component cannot be used for commercial purposes
```

**Generate SBOM:**

```bash
promptfoo scan-model ./models/ --sbom model-sbom.json
```

The SBOM includes component information, license metadata, risk scores, and copyright details in CycloneDX format.

**Why it matters:**
AI/ML projects often combine components with different licenses. AGPL requires source disclosure for network services, non-commercial licenses block commercial use, and unlicensed datasets create legal risks.

## HuggingFace URL Support

ModelAudit can scan models directly from HuggingFace URLs without manual downloading. When a HuggingFace URL is provided, ModelAudit:

1. **Downloads the model**: Uses the `huggingface-hub` library to download all model files to a temporary directory
2. **Scans all files**: Applies appropriate scanners to each file based on its format (config.json, pytorch_model.bin, model.safetensors, etc.)
3. **Cleans up**: Automatically removes downloaded files after scanning

**Supported URL formats:**

- `https://huggingface.co/user/model`
- `https://hf.co/user/model`
- `hf://user/model`

This feature requires the `huggingface-hub` package to be installed.
