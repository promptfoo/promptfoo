# metamorphic-evaluation (Controlled Output Relationships)

Check relationships between test variants after a normal eval. This example uses the deterministic `echo` provider and needs no API keys. It demonstrates the data flow; replace the target and controlled inputs to evaluate your own application.

```sh
npx promptfoo@latest init --example metamorphic-evaluation
npx promptfoo eval -c promptfooconfig.yaml --repeat 2 --no-cache -o results.json
npx promptfoo metamorphic check results.json --plan plan.json --format json -o report.json
```

For a source checkout, run from the repository root:

```sh
npm run local -- eval -c examples/metamorphic-evaluation/promptfooconfig.yaml --repeat 2 --no-cache -o /tmp/metamorphic-results.json
npm run local -- metamorphic check /tmp/metamorphic-results.json --plan examples/metamorphic-evaluation/plan.json --format markdown
```

Use a new output path on each run: analysis reports never overwrite existing files. The check command does not call targets or graders, execute exported configuration, or reapply transforms. Shared CLI initialization still runs.

## Declaring a complete panel

Tag every native test with `metadata.metamorphic.familyId` and `variantId`. The plan declares all expected families, variants, relations, contexts, and repetitions before results are read. Contexts match exact `promptIdx`, provider `id`, and optional provider `label`; omitting the label matches only an absent label. Labels and provider IDs are different fields.

Missing rows and repeats remain in the denominator. Duplicate expanded-test slots are errors: give each distinct input a unique variant/family identity. Multi-repeat exports must contain native `repeatIndex`; do not infer it from file order. Repetitions are not assumed independent.

## Selectors and relations

Selectors read `output` (the native **processed** output) or `namedScores`. `decode: json` explicitly parses an output string before applying an RFC 6901 pointer. Missing differs from `null`, `false`, zero, and the empty string. Array indices must be canonical; `/01` and `/length` do not select array elements. Escapes `~1` and `~0` represent slash and tilde.

Optional `normalize` operations apply only to the selected string, in the listed order: `trim`, `collapse-whitespace`, `lowercase`, `nfkc`. Nothing is normalized implicitly.

| Relation                                      | Requirement                                                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `equal`, `not-equal`                          | Deep JSON equality/inequality; object key order is ignored, types are preserved, -0 equals 0                           |
| `affine`                                      | `right` equals `left * scale + offset` within `absoluteTolerance + relativeTolerance * max(abs(expected), abs(right))` |
| `nondecreasing`, `nonincreasing`              | Numeric `right >= left` or `right <= left`                                                                             |
| `set-equal`, `subset`, `superset`, `disjoint` | Relations between arrays as sets; duplicates collapse                                                                  |
| `prefix`, `subsequence`                       | The left array is an ordered prefix/subsequence of the right array                                                     |

Wrong types, missing selections, stripped outputs, and nonfinite intermediate arithmetic are inconclusive. Empty sets and sequences follow mathematical definitions; cardinalities are reported. There is no LLM judge, semantic similarity, or implicit coercion.

## Source assertions and reports

The default `sourceAssertions: require-pass` makes an original assertion failure fail the overall panel even if all relations hold. `observe-output` explicitly allows relation diagnostics despite failed source assertions; failure counts remain visible. Provider execution errors and unknown status make dependent checks inconclusive. Relation summaries describe relations alone; panel and overall verdicts also apply source policy.

Exit codes are 0 for pass, 1 for failed requirements/invalid input, and 2 for inconclusive data. Failures take precedence over inconclusive checks. Native export versions 2 and 3 are supported through their flat result rows.

JSON, Markdown, and JUnit omit outputs, variables, prompts, provider identifiers, and error text by default. Logical plan labels remain visible and may themselves be sensitive. `--include-values --format json` explicitly includes selected source values. Reports describe observations and do not prove semantic correctness or that the caller's input transformation was valid.

`--max-details` truncates presentation only. By default, failures and unavailable evidence appear before passes; `--detail-order input-order` preserves the original ledger order. Counts, summaries, and exit status use every expected slot. JUnit includes a mandatory complete-panel case that fails for a failed or inconclusive panel, so artifact-only CI cannot silently accept missing evidence. Individual unavailable checks remain skipped; the CLI exits 2 for inconclusive panels. Reports are presentation artifacts, not authenticated replay records: retain the original export and plan for reproducibility.

## Inspect identities before writing a plan

```sh
npx promptfoo metamorphic inspect results.json --include-context-selectors --format json -o inventory.json
npx promptfoo metamorphic validate-plan plan.json --format markdown
```

Inspection lists observed contexts, variants, native repetition indices, duplicate slots, inconsistent expanded-test groups, and source statuses. It never infers expected coverage or valid relations from observed data. Exact provider selectors are private by default: explicitly including them can disclose endpoint URLs. Native `echo` exports use an empty provider label, so this example declares `providerLabel: ""`.

Plan validation checks the entire declared panel before target execution and explains relation direction, selection order, and expected workload. It does not certify the input transformation. Reports include joint family outcomes for each repetition, so separate relations passing in different repetitions do not imply that a complete family passed. Native identity coverage reports which rows actually supplied prompt and expanded-test group IDs; omitted legacy fields do not establish identity consistency.

## Node.js API

```js
import { metamorphic } from 'promptfoo';

const inventory = metamorphic.inspect(nativeExport);
const plan = metamorphic.parsePlan(planJson);
const report = metamorphic.analyze(nativeExport, plan);
const json = metamorphic.renderReport(report, 'json', { maxDetails: 100 });
```

These functions do not execute providers or load project configuration. Inputs and selected values are bounded, copied plain JSON. Runtime disclosure options must be booleans. Keep the original native export and plan alongside reports when reproducibility matters.
