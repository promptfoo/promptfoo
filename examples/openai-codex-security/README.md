# openai-codex-security (Compare Existing Codex Security Reports)

Compare two existing Codex Security reports in Promptfoo. Each provider column imports one report through `report_file`; this example does not start a scan or call a model. Supply your own reports: no findings or benchmark outcomes are bundled.

## Setup

```bash
npx promptfoo@latest init --example openai-codex-security
cd openai-codex-security
```

Set these environment variables to actual report files on the machine running Promptfoo:

| Variable                          | Required input                                                     |
| --------------------------------- | ------------------------------------------------------------------ |
| `CODEX_SECURITY_BASELINE_REPORT`  | Absolute path to the baseline SDK `ScanResult.toJSON()` JSON file  |
| `CODEX_SECURITY_CANDIDATE_REPORT` | Absolute path to the candidate SDK `ScanResult.toJSON()` JSON file |

Use reports for the same repository revision or snapshot and the same scope. Preserve their original manifests, findings, and coverage. A bare findings array is insufficient. Missing or invalid files produce provider errors; there is no fallback scan.

## Compare

```bash
npx promptfoo@latest eval --no-cache -o comparison.json
npx promptfoo@latest view
```

The provider validates report structure. The configuration checks whether the recorded scan completed and coverage is complete. These checks do not compute finding recall or precision, and a pass does not mean that a repository is secure. Inspect each result's findings, coverage, warnings, and provenance before comparing quality.

Recorded scan cost and duration describe the original operation. Reading an existing file incurs no new model usage; file-loading time is not scan latency. Keep missing historical measurements unknown.

The [guide](https://www.promptfoo.dev/docs/guides/codex-security-results/) includes a curated-recall assertion and explains how to establish expected finding IDs, adjudicate unmatched findings, and compare coverage and historical spend. See the [provider reference](https://www.promptfoo.dev/docs/providers/openai-codex-security/) for native operations and configuration.
