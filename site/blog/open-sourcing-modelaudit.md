---
title: 'Open-Sourcing ModelAudit: A Static Security Scanner for ML Model Files'
description: 'ModelAudit scans 30+ ML model formats for unsafe loading behaviors, known CVEs, and suspicious artifacts. Now MIT-licensed and open source.'
image: /img/blog/open-sourcing-modelaudit/hero.jpg
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
    deserialization attack,
    model supply chain,
    Hugging Face model scanning,
    torch.load security,
  ]
date: 2026-03-03
authors: [yash]
tags: [company-update, model-security, open-source, ai-security]
---

# Open-Sourcing ModelAudit

Before joining Promptfoo, I worked on model scanning at Databricks. The same failure mode kept showing up: teams pulled models from public registries, ran `torch.load()`, and treated the artifact like inert data. Model files are executable at load time.

For the past year at Promptfoo, I've been building ModelAudit, a static security scanner for ML model files. Today we're releasing it as an MIT-licensed open-source project.

<!-- truncate -->

## What it does

ModelAudit is a static scanner for ML model files. It flags unsafe loading behaviors (deserialization RCE, archive tricks), known CVEs, and suspicious artifacts across [30+ formats](/docs/model-audit/scanners/), without executing the model or importing ML frameworks.

[ModelAudit](https://github.com/promptfoo/modelaudit) is the open-source engine (Python, MIT). `promptfoo scan-model` is a CLI wrapper; you can also run `modelaudit scan` directly.

```bash
pip install modelaudit
modelaudit scan your_model.pkl
```

<details>
<summary>Example output</summary>

```
Scanning suspicious_model.pkl...

📊 SCAN SUMMARY
  Files: 1 | Duration: 0.29s
  Security Checks: ✅ 12 passed / ❌ 3 failed

🔍 SECURITY FINDINGS
  🚨 2 Critical | ⚠️ 1 Warning

    └─ 🚨 [suspicious_model.pkl (pos 45)]
       Found REDUCE opcode with non-allowlisted global: posix.system
       Why: The REDUCE opcode calls a callable with arguments, effectively
           executing arbitrary Python functions. This is the primary
           mechanism for pickle-based code execution attacks.
       opcode: REDUCE
       associated_global: posix.system (os.system on Unix)

    └─ ⚠️ [suspicious_model.pkl]
       Model affected by CVE-2025-32434 (PyTorch weights_only bypass)
       severity: CRITICAL
       affected_versions: torch<2.6.1
       remediation: Upgrade to torch>=2.6.1

  ❌ CRITICAL SECURITY ISSUES FOUND
```

</details>

Capabilities:

- **Formats:** PyTorch, pickle, Keras, ONNX, TensorFlow, GGUF, and [20+ more](/docs/model-audit/scanners/)
- **Output:** Text, JSON, [SARIF](https://sarifweb.azurewebsites.net/) for [CI/CD integration](/docs/model-audit/ci-cd)
- **Extras:** [SBOM generation](https://cyclonedx.org/), license detection, secret scanning
- **Remote pulls:** S3, GCS, Hugging Face Hub, MLflow, JFrog, DVC

```bash
# Scan from Hugging Face
modelaudit scan hf://microsoft/DialoGPT-medium

# SARIF output for GitHub Code Scanning / GitLab SAST
modelaudit scan model.pt --format sarif --output results.sarif

# Via the Promptfoo CLI wrapper (requires Node)
npx promptfoo scan-model model.pt
```

Python 3.10–3.13. Linux, macOS, Windows. No ML framework dependencies.

**Who this is for:** Platform and AppSec teams that need to gate model artifacts in CI/CD. If you pull models from public registries or run third-party checkpoints, this is for you.

---

## Why model files need scanning

When you `pip install` a package, you probably run it through a dependency scanner. When you download a model from Hugging Face and call `torch.load()`, what checks are you running?

For most teams: none.

In pickle, `__reduce__` defines what gets executed during unpickling:

```python
import pickle, os

class Exploit(object):
    def __reduce__(self):
        return (os.system, ("touch /tmp/pwned",))

# When loaded via pickle.loads() or torch.load(),
# os.system() executes the command.
payload = pickle.dumps(Exploit())
```

This is not theoretical. [JFrog found roughly 100 models](https://jfrog.com/blog/data-scientists-targeted-by-malicious-hugging-face-ml-models-with-silent-backdoor/) on Hugging Face containing similar payloads. And pickle is just one format:

- **PyTorch:** [CVE-2025-32434](https://github.com/pytorch/pytorch/security/advisories/GHSA-53q9-r3pm-6pq6) (CVSS 9.3). `weights_only=True`, the recommended mitigation, could be bypassed for remote code execution.
- **Keras:** [CVE-2025-1550](https://nvd.nist.gov/vuln/detail/CVE-2025-1550) (CVSS 9.8). `safe_mode=True` could be circumvented via a [crafted config within the archive](https://jfrog.com/blog/keras-safe_mode-bypass-vulnerability/).
- **ONNX:** [CVE-2025-51480](https://security.snyk.io/vuln/SNYK-PYTHON-ONNX-10877916) (CVSS 8.8). Path traversal in external data references can overwrite arbitrary files.
- **Supply chain:** [Palo Alto Unit42](https://unit42.paloaltonetworks.com/model-namespace-reuse/) documented attackers re-registering abandoned model namespaces to distribute malicious models under trusted names.

Hugging Face hosts over two million models. Most organizations pull from public registries without scanning what they download.

## How we got here

When I started at Promptfoo, the team was building [AI red teaming](https://www.promptfoo.dev/docs/red-team/) and [code scanning](https://www.promptfoo.dev/code-scanning/) capabilities. We could test how an LLM application _behaves_ at runtime, but had no visibility into whether the models themselves were safe to load. If a model file triggers code execution on deserialization, runtime defenses don't matter. The compromise happens before the application starts.

There are good tools in this space. We use several of them. We also found bugs in them.

Building ModelAudit meant studying the pickle VM closely: how opcodes chain together, how function calls get resolved, where the gaps are in static analysis. That work kept turning up bypasses in existing scanners.

My teammate Michael D'Angelo found that fickling's unsafe-imports list was missing high-risk standard library modules like `ctypes`, `importlib`, and `multiprocessing`. Malicious pickles importing those modules passed as safe. Trail of Bits patched this in fickling 0.1.7 ([CVE-2026-22609](https://github.com/advisories/GHSA-q5qq-mvfm-j35x)).

I found two more classes of bypass. The first: fickling's `OBJ` opcode handler pushed function calls onto the interpreter stack without saving them to the AST. Discard the result with `POP` and the call disappears. A pickle could spawn a listener on port 9999 and fickling would report `LIKELY_SAFE` ([GHSA-mxhj-88fx-4pcv](https://github.com/advisories/GHSA-mxhj-88fx-4pcv)).

The second: appending a `BUILD` opcode after `REDUCE` exploited how fickling classifies stdlib imports as safe and excludes `__setstate__` calls from analysis. Another full bypass of all five safety interfaces ([GHSA-mhc9-48gj-9gp3](https://github.com/advisories/GHSA-mhc9-48gj-9gp3)). Trail of Bits fixed both in fickling 0.1.8. We follow coordinated disclosure when we find issues.

None of this is a knock on fickling. We're glad Trail of Bits fixed these quickly. The pickle VM is adversarial territory, and every scanner that operates there will have gaps. The ecosystem gets more robust when multiple tools with different approaches are looking at the same files.

That work also made it clear that we needed something covering the full range of formats used in production, not just pickle. We wanted a tool that supports SARIF for CI/CD and maps findings to specific CVEs so teams can prioritize remediation.

ModelAudit started as an internal capability within the Promptfoo platform ([promptfoo.dev/model-security](https://www.promptfoo.dev/model-security/)). Today's release is the standalone extraction of that scanning engine.

## The landscape

Several good tools exist in this space. [picklescan](https://github.com/mmaitre314/picklescan) is [integrated into Hugging Face's scanning pipeline](https://huggingface.co/docs/hub/en/security-pickle) and is fast and practical at scale, though its blocklist approach is pickle-only and [inherently reactive to new bypass classes](https://jfrog.com/blog/unveiling-3-zero-day-vulnerabilities-in-picklescan/). [Fickling](https://github.com/trailofbits/fickling) by Trail of Bits can decompile pickle streams into readable Python and recently added an [allowlist-based scanner](https://blog.trailofbits.com/2025/09/16/ficklings-new-ai/ml-pickle-file-scanner/) that is architecturally stronger against unknown threats, though it is also pickle-only. [ModelScan](https://github.com/protectai/modelscan) by ProtectAI covers H5, Pickle, and TensorFlow SavedModel; ProtectAI's commercial [Guardian](https://protectai.com/guardian) extends to 35+ formats.

[Safetensors](https://github.com/huggingface/safetensors) takes the strongest approach: eliminate executable code from the format entirely. If you can use safetensors, you should. But [roughly 45% of popular Hugging Face models still use pickle](https://cs.brown.edu/~vpk/papers/pickleball.ccs25.pdf) (CCS 2025), and the [conversion pipeline itself can be a target](https://hiddenlayer.com/innovation-hub/silent-sabotage/).

Rough comparison (March 2026; see each project's repository for current status):

| Tool           | Formats                | Approach                     | CVE rules | Output                |     Availability      |
| -------------- | ---------------------- | ---------------------------- | :-------: | --------------------- | :-------------------: |
| picklescan     | Pickle                 | Blocklist                    |    No     | Text                  |      Open source      |
| Fickling       | Pickle                 | Allowlist + decompiler       |    No     | Text, JSON            |      Open source      |
| ModelScan      | Pickle, H5, SavedModel | Blocklist                    |    No     | JSON, console         |      Open source      |
| Safetensors    | N/A (safe format)      | Safe-by-design               |    N/A    | N/A                   |      Open source      |
| Guardian       | 35+                    | Multi-method                 |    Yes    | Multiple              |      Commercial       |
| HiddenLayer    | Multiple               | Multi-method                 |    Yes    | Multiple              |      Commercial       |
| **ModelAudit** | **30+**                | **Format-specific analysis** |  **Yes**  | **Text, JSON, SARIF** | **Open source (MIT)** |

ModelAudit is not a replacement for these tools. Teams already using picklescan or ModelScan can run ModelAudit alongside them. SARIF results from multiple scanners aggregate in the same CI pipeline.

## How it works

_This section covers scanner internals. If you just want to try it, skip to [Try it](#try-it)._

### Format-specific parsing

Each scanner parses its format natively and checks invariants specific to that format's threat model. Some use allowlisting, some use structural analysis, all include targeted CVE detection. A few examples:

- **Pickle:** Walks the opcode stream, reconstructs `STACK_GLOBAL` targets (which have `arg=None` in pickletools; the module and class must be resolved from preceding `SHORT_BINUNICODE`/`BINUNICODE` ops), tracks memoized references through `BINGET`/`LONG_BINGET`, and maps `REDUCE` calls to their actual callable targets.
- **ONNX:** Parses the protobuf graph structure, normalizes external data paths to detect path traversal ([CVE-2025-51480](https://security.snyk.io/vuln/SNYK-PYTHON-ONNX-10877916)), and inspects custom operator definitions for suspicious patterns.
- **Keras:** Examines both H5 and ZIP archive variants. Checks archive members for embedded executables and configuration files for unsafe layer types (Lambda layers, custom objects). Extension checks are case-insensitive to catch renamed payloads.
- **NeMo:** Recursively inspects Hydra `_target_` configurations for callable injection ([CVE-2025-23304](https://nvd.nist.gov/vuln/detail/CVE-2025-23304)), checking against known-dangerous targets like `os.system`, `subprocess.call`, and `importlib.import_module`.
- **PyTorch ZIP:** Extracts pickle files from ZIP archives, runs the pickle scanner on each, then cross-references PyTorch version metadata against known vulnerable versions.
- **Archives (ZIP, TAR, 7-Zip):** Checks for path traversal in member names, symlink attacks, and decompression bombs. Bounds member reads to 10 MB by default.

Lower-risk formats get lighter analysis. The safetensors scanner validates structural integrity. The GGUF scanner inspects headers and metadata fields.

### Format coverage

Scanner depth varies with risk. The pickle opcode analyzer is the deepest; the safetensors scanner mostly validates integrity. The count includes archive and configuration scanners that apply across model formats.

Risk level here reflects likelihood of code execution or file system impact during loading:

| Risk Level  | Formats                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------- |
| **High**    | Pickle, PyTorch (.pt/.pth/.ckpt/.bin), Joblib, NumPy, Skops                                        |
| **Medium**  | TensorFlow SavedModel, Keras (.h5/.keras), ONNX, XGBoost                                           |
| **Low**     | SafeTensors, GGUF/GGML, JAX/Flax, TFLite, ExecuTorch, TensorRT, PaddlePaddle, OpenVINO, PMML, NeMo |
| **Archive** | ZIP, TAR, 7-Zip, OCI layers                                                                        |
| **Config**  | Manifests, Jinja2 templates, metadata files                                                        |

Some "low" risk formats carry higher risk in practice. NeMo files have a known configuration injection vector (CVE-2025-23304). Others increase in risk when wrapped in archives or consumed by buggy loaders.

### Performance

In our testing, ModelAudit scans local files in under a second for single models under 1 GB. Streaming analysis bounds memory usage for larger files. Remote scanning speed depends on download bandwidth.

We'll publish formal benchmarks in a future release. If you have representative model types and sizes you'd like included, [open an issue](https://github.com/promptfoo/modelaudit/issues).

## Limitations

No scanner catches everything.

- **A clean scan is not proof of safety.** A novel attack that avoids all current detection patterns will pass undetected. This applies to every static analysis tool.
- **No runtime behavior analysis.** ModelAudit cannot detect payloads that only activate under specific runtime conditions.
- **No adversarial robustness testing.** ModelAudit checks whether a model file is _safe to load_, not whether it _produces correct outputs_ under adversarial conditions. For LLM red teaming, see [Promptfoo](https://www.promptfoo.dev/docs/red-team/).
- **No weight-level backdoor detection (yet).** We detect unsafe code in serialization. We do not yet detect backdoors hidden in tensor weight values. Techniques like [tensor steganography](https://labs.snyk.io/resources/tensor-steganography-and-ai-cybersecurity/) are an active research area; we're not aware of a widely adopted scanner that reliably detects this class of payloads today.
- **Detection depth varies by format.** High-risk formats get deep analysis. Lower-risk formats get structural validation.

ModelAudit is one layer of defense. It works best alongside safe formats (safetensors where possible), provenance verification (signatures, checksums), and runtime controls (sandboxing, network egress filtering).

## Try it

The entire scanning engine is in the [open-source repository](https://github.com/promptfoo/modelaudit). All scanners, all CVE detection rules, all output formats. Read through the code, run it on your models, make it your own.

```bash
pip install modelaudit
modelaudit scan your_model.pkl
```

- [Documentation](/docs/model-audit/)
- [Scanner reference](/docs/model-audit/scanners/)
- [CI/CD integration guide](/docs/model-audit/ci-cd)
- [Advanced usage](/docs/model-audit/usage)
- [Contribution guide](https://github.com/promptfoo/modelaudit/blob/main/CONTRIBUTING.md)

If you want a hosted UI and managed integrations, Promptfoo also offers ModelAudit in the [platform](https://www.promptfoo.dev/model-security/). The engine is the same open-source code.

## What's next

- **Expanding CVE coverage** for TensorFlow, Keras, and ONNX vulnerabilities
- **Published benchmarks** for scan speed, memory usage, and false positive rates

Contributions are welcome. [Open issues](https://github.com/promptfoo/modelaudit/issues) on GitHub or reach out directly.
