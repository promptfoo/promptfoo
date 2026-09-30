# provider-typesafe (TypeSafe Jev)

You can run this example with:

```bash
npx promptfoo@latest init --example provider-typesafe
cd provider-typesafe
```

## Usage

Set your `TYPESAFE_API_KEY` environment variable. You can create a key in the [TypeSafe console](https://console.typesafe.ai/keys).

Then run:

```bash
npx promptfoo@latest eval --no-cache -o results.json
```

Inspect `results.json` for assertion scores and errors, or view the results with `npx promptfoo@latest view`. The example makes five grading calls to TypeSafe, plus any retries, and uses your account's API credits.

## What this shows

Jev is TypeSafe's "System One" model. It answers typed questions with calibrated probabilities instead of generating text. The config uses the `echo` provider to return two canned support replies, then grades them with Jev:

- `llm-rubric` with `typesafe:jev-latest` as the grader. Each rubric is sent as a yes/no (Noul) question. Set its cutoff with the provider's `config.threshold` (default 0.5).
- `llm-rubric` with `levels`, which sends a Score question and scales the result to 0–1.
- `classifier` with `labels`, which sends a Choice question and checks the probability of one label.

Jev doesn't return a rationale. Each `llm-rubric` grading `reason` is derived from the answer, such as `Derived from Jev Noul p=0.93 >= threshold 0.5`. Its raw answer is in the grading result's `metadata.typesafe`; classifier assertions report the selected label's probability as their score without this metadata.

Caching is disabled by default. To reuse responses, give each TypeSafe provider config the same nonsecret, account-specific `cacheNamespace` and omit `--no-cache`. Use different namespaces for different accounts; never use an API key as a namespace.

See the [provider docs](https://www.promptfoo.dev/docs/providers/typesafe/) for all options.
