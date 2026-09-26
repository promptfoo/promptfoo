# openai-codex-security-results (Synthetic Codex Security Results)

Check result presentation, coverage assertions, and validation dispositions without model calls or a repository scan. No API keys, Python, or Codex Security SDK installation are needed for this example.

## Run the example

```bash
npx promptfoo@latest init --example openai-codex-security-results
cd openai-codex-security-results
npx promptfoo@latest eval --no-cache -o results.json
npx promptfoo@latest view
```

The eval deliberately includes unsuccessful cases and may exit nonzero. Inspect `results.json` or the results UI:

| Scenario | Expected outcome                                                                      |
| -------- | ------------------------------------------------------------------------------------- |
| Complete | Pass: valid JSON and complete coverage, despite one informational placeholder finding |
| Partial  | Assertion failure: valid JSON, zero findings, but incomplete coverage                 |
| Deferred | Assertion failure: valid JSON, but disposition is not reportable                      |
| Error    | Provider error: no completed result                                                   |

`provider.cjs` returns hand-authored data from `responses.json`. These are minimal presentation fixtures, not complete SDK artifacts. No finding describes a real vulnerability. The synthetic label is preserved in provider metadata and descriptions. Zero scan cost is synthetic; validation cost is omitted to demonstrate unreported usage. SDK/plugin versions and artifact paths are intentionally absent because neither SDK execution nor artifact generation occurred.

See [Understand Codex Security results](https://www.promptfoo.dev/docs/guides/codex-security-results/) for interpretation and the distinction between a passing assertion and security evidence.
