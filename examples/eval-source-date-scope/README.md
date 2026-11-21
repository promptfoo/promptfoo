# eval-source-date-scope (Citation Identity and Date Scope)

This offline example checks whether a structured answer stays within the identity, date, and coverage of its cited evidence. It uses the Echo provider to evaluate eight invented recorded answers. Four are deliberately wrong, so a correct run produces **4 passes and 4 failures**, with no evaluation errors.

The example illustrates a failure pattern documented in [SanctionsKit's source-backed AI sanctions study](https://www.sanctionskit.com/resources/ai-sanctions-screening-study#section-4): a selected web-enabled API answer used a removal notice to support a claim of current listing. That selected example belongs to the API study, separate from its Google observations. The fixtures here are invented teaching cases, not copies of those model responses or claims about any real person or organization. SanctionsKit contributed this example.

## Run

```sh
npx promptfoo@latest init --example eval-source-date-scope
cd eval-source-date-scope
npx promptfoo@latest eval --no-cache -o results.json
```

No API key or model is required. Echo returns the supplied answer, and the local JavaScript assertion grades it without retrieving sources or calling a judge. The CLI's normal telemetry/settings still apply; the evaluation itself makes no model or source requests. The four intentional failures produce a nonzero evaluation exit status. Inspect `results.json` to distinguish assertion failures from errors.

When reviewing this contribution in a Promptfoo checkout, test the local source version from the repository root:

```sh
npm run local -- eval -c examples/eval-source-date-scope/promptfooconfig.yaml --no-cache -o results.json
```

## What the assertion checks

Each answer has a status, an as-of date, and citation identifiers. Each test supplies curated source metadata. For this exercise, a decisive membership answer requires a cited complete snapshot with the exact list, as-of date, and entity identifier. A current complete snapshot can support either presence or absence; a historical notice, stale snapshot, partial search, or different identifier cannot. Conflicting comparable snapshots require `cannot_verify`.

| Fixture                                                   | Expected result |
| --------------------------------------------------------- | --------------- |
| Current presence claimed from a removal notice            | Fail            |
| Current membership left unverified from that notice alone | Pass            |
| Presence in an exact current complete snapshot            | Pass            |
| Absence from an exact current complete snapshot           | Pass            |
| Absence inferred from a partial search                    | Fail            |
| Presence inferred from another identifier                 | Fail            |
| Current presence inferred from an older snapshot          | Fail            |
| Abstention when comparable snapshots conflict             | Pass            |

## Boundaries

The assertion trusts the fixture metadata and checks only the cited evidence. It does not parse natural-language entailment, verify that a source is authentic or complete, judge every available source, resolve legal restrictions, or perform sanctions screening. A real evaluator needs separately validated evidence and a documented labeling policy. These eight cases demonstrate assertion behavior; their pass rate is not a model-performance estimate.

To adapt the pattern, replace the invented cases with reviewed evidence and logged structured answers. Keep the expected date, identity, list and completeness decisions in the test context, rather than letting the model choose them. If you replace Echo or add model-graded assertions, model calls and charges may apply.
