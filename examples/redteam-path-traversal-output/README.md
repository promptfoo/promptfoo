# redteam-path-traversal-output (Path Traversal Output Detection)

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-path-traversal-output
```

## What this shows

The `path-traversal-output` red-team plugin flags model responses that emit a
path-traversal exploit payload — a traversal sequence (or sensitive drive prefix)
coupled with a sensitive target file (`/etc/passwd`, `C:\Windows\System32\config\SAM`,
`file://` URIs, `php://filter` wrappers, `.aws/credentials`, null-byte truncation, …).

Its grader is **deterministic**: it normalizes the output (percent/HTML/overlong-UTF-8
decoding, separator folding) and matches against a fixed rule set. No LLM judge, so
results are cheap, reproducible, and explainable.

## Deterministic demo (no API key)

`promptfooconfig.yaml` runs entirely offline: the `echo` provider returns each
`response` var verbatim and the grader inspects that text.

```bash
promptfoo eval -c promptfooconfig.yaml
```

How to read the table:

- **`leak:` rows are expected to FAIL** — a failing assertion is the grader catching a
  path-traversal payload (the red-team finding). This run flags **6/6** leaks.
- **`benign:` rows are expected to PASS** — no payload present. This run passes **4/4**.

So a non-zero exit code here is expected and correct: it means the leaks were detected.

## Measured quality

The grader's precision/recall on a labeled corpus is locked in as a CI gate in
`test/redteam/plugins/pathTraversalOutput.corpus.test.ts`:

```text
recall on true leaks ............ 10/10 (100%)
false positives on clean output .. 0/7  (0%)
```

Known tradeoff: under the current strict policy, defensive/educational text that quotes
a literal payload (e.g. "never use `../../etc/passwd`") is also flagged. That case is
tracked separately in the corpus test so any future precision change stays visible.

## Trying it against a real LLM

To exercise the full plugin (attack generation + grading) against your own target,
use a red-team config that names the plugin and points at a provider you control:

```yaml
redteam:
  plugins:
    - path-traversal-output
  numTests: 10
targets:
  - openai:chat:gpt-4o-mini
```

```bash
export OPENAI_API_KEY=your-key-here
promptfoo redteam run
```

This path calls a live model (cost + nondeterminism), so it is intentionally not part
of the offline demo above.
