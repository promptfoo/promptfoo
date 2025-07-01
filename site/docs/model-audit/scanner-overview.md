---
title: Scanner Quick Reference
description: Quick reference table of all ModelAudit scanners with key features.
keywords: [model scanners, scanner reference, security scanners]
sidebar_label: Scanner Overview
sidebar_position: 4
---

# Scanner Quick Reference

ModelAudit includes 15+ specialized scanners for different model formats. Each scanner is designed to detect format-specific security threats.

## Scanner Summary

| Scanner                                                       | Formats                    | Key Security Checks                               |
| ------------------------------------------------------------- | -------------------------- | ------------------------------------------------- |
| **[Pickle](./scanners.md#pickle-scanner)**                    | `.pkl`, `.pickle`, `.ckpt` | Malicious code, unsafe opcodes, dangerous imports |
| **[PyTorch](./scanners.md#pytorch-zip-scanner)**              | `.pt`, `.pth`              | ZIP archives with embedded pickles, scripts       |
| **[TensorFlow](./scanners.md#tensorflow-savedmodel-scanner)** | `.pb`                      | Dangerous operations, file I/O, code execution    |
| **[TF Lite](./scanners.md#tensorflow-lite-scanner)**          | `.tflite`                  | Custom ops, Flex delegate, metadata threats       |
| **[Keras](./scanners.md#keras-h5-scanner)**                   | `.h5`, `.keras`, `.hdf5`   | Lambda layers with arbitrary code                 |
| **[ONNX](./scanners.md#onnx-scanner)**                        | `.onnx`                    | Custom operators, external data integrity         |
| **[SafeTensors](./scanners.md#safetensors-scanner)**          | `.safetensors`             | Metadata validation, offset integrity             |
| **[GGUF/GGML](./scanners.md#ggufggml-scanner)**               | `.gguf`, `.ggml`           | Header validation, metadata security              |
| **[JAX/Flax](./scanners.md#jax-checkpoint-scanner)**          | `.msgpack`, `.orbax`       | MessagePack exploits, JAX callbacks               |
| **[NumPy](./scanners.md#numpy-scanner)**                      | `.npy`, `.npz`             | Object arrays, dimension attacks                  |
| **[Joblib](./scanners.md#joblib-scanner)**                    | `.joblib`                  | Compression bombs, embedded pickles               |
| **[ZIP Archive](./scanners.md#zip-archive-scanner)**          | `.zip`                     | Path traversal, zip bombs, nested scanning        |
| **[TensorRT](./scanners.md#tensorrt-scanner)**                | `.engine`, `.plan`         | Plugin references, embedded libraries             |
| **[PMML](./scanners.md#pmml-scanner)**                        | `.pmml`                    | XXE attacks, script injection                     |
| **[Binary](./scanners.md#pytorch-binary-scanner)**            | `.bin`                     | Embedded executables, format detection            |

## Common Threat Categories

### Code Execution

- **Pickle exploits**: Arbitrary code via deserialization
- **Lambda layers**: Python code in Keras models
- **Custom operations**: TensorFlow PyFunc, ONNX custom ops
- **JAX callbacks**: Experimental host callbacks

### Data Integrity

- **Format validation**: Magic bytes, headers, structure
- **Compression attacks**: Zip bombs, decompression exploits
- **Path traversal**: Directory escape attempts
- **Weight anomalies**: Statistical backdoor detection

### Embedded Threats

- **Executables**: PE (Windows), ELF (Linux), Mach-O (macOS)
- **Scripts**: Shell scripts, Python code
- **External references**: Unauthorized file/network access
- **Metadata exploits**: Malicious content in metadata fields

## Advanced Features

### License Compliance

All scanners include license detection for:

- AGPL network service warnings
- Commercial use restrictions
- SBOM (Software Bill of Materials) generation

### Auto-Detection

ModelAudit automatically detects the actual format regardless of file extension:

- `.bin` files → Pickle, SafeTensors, ONNX, or PyTorch
- Content-based routing to appropriate scanner
- Format validation to detect spoofing

### Resource Protection

Built-in safeguards against:

- Memory exhaustion (size limits)
- CPU DoS (timeout protection)
- Infinite recursion (depth limits)
- Decompression bombs (ratio checks)

## Next Steps

- **[Detailed Scanner Reference](./scanners.md)** - In-depth documentation for each scanner
- **[Security Best Practices](https://docs.promptfoo.dev/docs/model-audit/best-practices)** - Recommendations for secure model handling
- **[Contributing](https://github.com/promptfoo/modelaudit/blob/main/CONTRIBUTING.md)** - Add support for new formats
