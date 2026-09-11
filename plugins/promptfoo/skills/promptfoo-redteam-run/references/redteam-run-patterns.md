# Redteam Run Patterns

Use `--remote` for hosted generation/evaluation even when a local OpenAI key
exists. If generated-config validation reports remote inference disabled, use
the scan's existing Cloud credentials or set `PROMPTFOO_REMOTE_GENERATION_URL`
to its approved endpoint (hosted default: `https://api.promptfoo.app/api/v1/task`).
Keep a configured self-hosted endpoint unchanged.

## Evaluate Generated Tests

Use the project's installed `promptfoo`; inside its repository, align Node with
`source ~/.nvm/nvm.sh && nvm use` and substitute `npm run local --`.

```bash
promptfoo validate config -c redteam.yaml
promptfoo redteam eval -c redteam.yaml -o results.json --no-cache --no-share --no-progress-bar --remote
```

Keep the generated file beside its source config for config-relative targets
such as `file://./target.mjs` or `file://./target.py:call_api`. A custom
`redteam.provider` is resolved from the command working directory, so use an
absolute path when needed. Python graders support `file://grader.py:grade_redteam`.

Reuse generated tests to avoid unnecessary generation. Adaptive strategies
still generate attacks during eval: save their transcripts and attempt counts.
Replaying concrete attacks is a different check from repeating an adaptive scan.

## Generate And Evaluate

Separate generation and eval to keep distinct config/result artifacts:

```bash
promptfoo redteam generate -c promptfooconfig.yaml -o redteam.yaml --no-cache --no-progress-bar --strict --remote
promptfoo redteam eval -c redteam.yaml -o results.json --no-cache --no-share --no-progress-bar --remote
```

Choose a fresh generated path or use `--force` to intentionally replace it.
If using the combined command, `redteam run` has no `--no-share` flag:

```bash
PROMPTFOO_DISABLE_SHARING=true promptfoo redteam run -c promptfooconfig.yaml --no-cache --no-progress-bar --strict --remote
```

Result sharing is separate from remote generation, grading, validation, and
target requests. Keep data approved for each destination.

## Grader Failures And Fixture QA

A transport error or malformed grading response means the result is ungraded.
Inspect the provider error, model/auth configuration, and returned payload shape;
repair the grader before calculating a real attack success rate.

Use local deterministic graders only for fixture/protocol QA. They must return
JSON with `pass`, `score`, and `reason`, and test only the candidate output.
Marker-based graders cannot judge arbitrary policy or authorization violations.
Do not replace a failed real grader with a mock and call the scan successful.

JavaScript graders expose `callApi`; Python uses
`call_api(prompt, options, context)` or the function named by its provider suffix.
Python returns a dict with `output` containing the JSON string. Config reaches
JS via constructor `options.config`, and Python via `options["config"]`.
Use `workers: 1` for non-thread-safe Python SDKs, a suitable `timeout`, and
anchor nearby imports to `Path(__file__).resolve().parent`.

## Inspect JSON Output

```bash
jq '{stats: .results.stats, shareableUrl}' results.json
jq -r '.results.results[] | select(.success == false) | [.metadata.pluginId, .metadata.strategyId, .response.output, .error] | @json' results.json
jq '.results.stats | (.successes + .failures) as $n | if $n > 0 then .failures / $n else null end' results.json
```

Report zero graded rows as inconclusive and errors separately. `shareableUrl`
should be null with `--no-share`; this says nothing about remote grading traffic.

## Narrow Reruns

```bash
promptfoo redteam eval -c redteam.yaml --filter-metadata pluginId=policy -o policy.json --no-cache --no-share --no-progress-bar --remote
promptfoo redteam eval -c redteam.yaml --filter-failing results.json -o failing.json --no-cache --no-share --no-progress-bar --remote
promptfoo redteam eval -c redteam.yaml --filter-errors-only results.json -o errors.json --no-cache --no-share --no-progress-bar --remote
```

Use `promptfoo retry <evalId>` for ERROR rows that should be repaired in place.
A filtered rerun's denominator differs from the original scan. Keep both artifacts
and report their coverage separately; rerun all relevant cases after a fix.

## CI Gate

Use a fresh output path and preserve infrastructure failures. The example allows
at most 15% valid attack successes; replace that threshold with the app's policy:

```bash
set -e
result_dir=$(mktemp -d)
PROMPTFOO_FAILED_TEST_EXIT_CODE=0 promptfoo redteam eval -c redteam.yaml -o "$result_dir/results.json" --no-cache --no-share --no-progress-bar --remote
node -e "const s=require(process.argv[1]).results.stats; const valid=[s.successes,s.failures,s.errors].every(n=>Number.isInteger(n)&&n>=0); const n=s.successes+s.failures; if(!valid || n===0 || s.errors>0 || s.failures/n>0.15) process.exit(1)" "$result_dir/results.json"
```

Also verify expected plugin/test coverage and block critical violations even when
an aggregate rate is low. `PROMPTFOO_FAILED_TEST_EXIT_CODE=0` delegates failed and
errored result checks to this gate; it must reject errors explicitly.

## Report UI

`promptfoo redteam report` opens an interactive local server. Run it when the
user requests the UI; use JSON artifacts for automated checks.
