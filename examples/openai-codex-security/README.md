# openai-codex-security (Compare Source Review and Saved Reports)

Compare Codex Security's standard source review at low and medium reasoning effort, using `gpt-5.6-luna` on the same pinned OWASP Juice Shop source. A separate config compares existing genuine reports without repeating a scan. A recorded case study is summarized in [benchmark-results.json](benchmark-results.json); raw reports are not bundled.

## Setup

```bash
npx promptfoo@latest init --example openai-codex-security
cd openai-codex-security
npm install promptfoo @openai/codex-security@^0.1.31
```

Native operations require a supported Node.js version, Python 3.10+, and Codex Security account/model access. Use a saved Codex login or API credentials in the process running Promptfoo; see the [installation and authentication reference](https://www.promptfoo.dev/docs/providers/openai-codex-security/#installation-and-authentication). With the default `auth: auto`, an environment API key takes precedence over a saved login. Set `auth: chatgpt` on both providers if you intend to use the saved login.

Prepare a clean source checkout; there is no need to install or run Juice Shop:

```bash
git clone --branch v19.0.0 --single-branch https://github.com/juice-shop/juice-shop.git juice-shop-v19
git -C juice-shop-v19 checkout --detach 36870cbbdfe7864698e1adf644c7bf772f67ebb7
export CODEX_SECURITY_REPOSITORY="$PWD/juice-shop-v19"
```

The default config reviews `routes/basket.ts`, `routes/delivery.ts`, and `routes/orderHistory.ts`: 123 source lines at this revision. Both columns use the same prompt, paths, model, and $3 estimated scan-spend threshold; only the requested reasoning effort differs. The threshold is per scan, can be exceeded by in-flight work, and is not a billing cap.

## Compare source reviews

```bash
npx promptfoo@latest eval --max-concurrency 1 --no-cache -o comparison-live.json
npx promptfoo@latest view
```

This command starts two real SDK operations. The prompt requests source inspection only, including validation of findings against source; it does not request application execution or vulnerability reproduction. These instructions are not an enforced execution sandbox. Use the SDK in an environment suitable for reviewing untrusted source.

The benchmark prompt includes intentional and documented flaws: a known challenge label is not a reason to exclude a source-supported finding. State this scope explicitly when evaluating an intentionally vulnerable application.

The assertions check scan completion and coverage, not recall or precision. Preserve the eval config and original SDK reports (`response.raw` in the exported results). Provider labels and configured effort describe the request; compare recorded model, effective settings when available, SDK/plugin versions, usage, warnings, and source provenance before attributing differences to reasoning effort. Missing observations remain unknown. A completed source review does not establish runtime exploitability or that the repository is secure.

## Recorded case study

The [guide's recorded comparison](https://www.promptfoo.dev/docs/guides/codex-security-results/#recorded-juice-shop-comparison) covers one run each of Luna low, Luna medium, and a Terra medium reference configuration. All three found one of two independently curated issues; Terra also reported a separately supported issue outside that expected set. Both native Luna runs reported partial coverage with SDK recovery warnings. These observations do not establish a general model ranking.

[benchmark-results.json](benchmark-results.json) records exact report hashes, source and prompt identity, requested and separately observed settings, adjudication counts, usage, and estimated cost. Recorded runs used SDK 0.1.31/plugin 0.1.95, fresh SDK state per run, saved ChatGPT authentication, and a three-thread limit. The portable config above leaves authentication and thread limits at SDK defaults; the recorded Luna runs also overlapped, while the example command runs sequentially. Consult the receipt before treating a new run as an exact replication.

## Compare saved reports

Use `promptfooconfig.reports.yaml` to import existing SDK `ScanResult.toJSON()` files. This mode requires no SDK, Python, or model credentials. Set these variables in the process running Promptfoo:

| Variable                          | Required input                                                     |
| --------------------------------- | ------------------------------------------------------------------ |
| `CODEX_SECURITY_BASELINE_REPORT`  | Absolute path to the baseline SDK `ScanResult.toJSON()` JSON file  |
| `CODEX_SECURITY_CANDIDATE_REPORT` | Absolute path to the candidate SDK `ScanResult.toJSON()` JSON file |

Use reports for the same source snapshot and scope. Keep their original manifest, findings, and coverage together; a bare findings array or entire Promptfoo eval export is insufficient. Missing or invalid files produce errors without a fallback scan.

Keep the full native eval export alongside the extracted SDK reports. In SDK 0.1.31, `ScanResult.toJSON()` omits runtime operation and recovery warnings, so imports can show partial coverage with no warnings and an unknown operation. The case-study warning counts come from native eval metadata.

To extract both reports from the eval export generated above, run the following in the example directory. Exported `response.raw` can be a JSON string or an object; the snippet also accepts an untransformed `response.output` if raw data is absent. It checks the manifest document type and refuses to overwrite existing report files. The provider performs full report validation during import.

```bash
node --input-type=module <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const exported = JSON.parse(readFileSync('comparison-live.json', 'utf8'));
for (const [label, file] of [
  ['Luna low', 'report-low.json'],
  ['Luna medium', 'report-medium.json'],
]) {
  const rows = exported.results.results.filter(row => row.provider?.label === label);
  if (rows.length !== 1) throw new Error(`Expected one result for ${label}`);
  const { response } = rows[0];
  const value = response.raw ?? response.output;
  const report = typeof value === 'string' ? JSON.parse(value) : value;
  if (report?.manifest?.documentType !== 'codex-security.scan-manifest') {
    throw new Error(`Missing scan report for ${label}`);
  }
  writeFileSync(file, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
JS
export CODEX_SECURITY_BASELINE_REPORT="$PWD/report-low.json"
export CODEX_SECURITY_CANDIDATE_REPORT="$PWD/report-medium.json"
```

```bash
npx promptfoo@latest eval -c promptfooconfig.reports.yaml --no-cache -o comparison-reports.json
npx promptfoo@latest view
```

Import incurs no new model usage. Recorded cost and duration describe the original operation; file-loading time is not scan latency. Keep missing historical measurements unknown.

The [guide](https://www.promptfoo.dev/docs/guides/codex-security-results/) explains independent ground-truth curation, includes an assertion for curated-set recall on saved reports, and distinguishes coverage, precision, and recorded spend. See the [provider reference](https://www.promptfoo.dev/docs/providers/openai-codex-security/) for configuration details.
