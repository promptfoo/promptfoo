# provider-typesafe (TypeSafe Jev)

Jev is TypeSafe's "System One" model. It answers typed questions with probabilities instead of generating text, which makes it a fast grader and classifier.

You can run this example with:

```bash
npx promptfoo@latest init --example provider-typesafe
cd provider-typesafe
```

## Usage

Set `TYPESAFE_API_KEY`. You can create a key in the [TypeSafe console](https://console.typesafe.ai/keys).

```bash
export TYPESAFE_API_KEY=your_api_key_here
```

### Grade and classify outputs

```bash
npx promptfoo@latest eval
```

`promptfooconfig.yaml` uses the `echo` provider to return two canned support replies, then grades them with Jev:

- `llm-rubric` sends each rubric as a yes/no (Noul) question. The score is the probability that the rubric holds.
- `llm-rubric` with `levels` sends a Score question and scales the result to 0–1.
- `classifier` sends a Choice question and checks the probability of one label.

Jev doesn't return a rationale, so each `reason` states how the verdict was derived, such as `Jev Noul probability 0.99 >= threshold 0.5`.

### Test your own Jev questions

```bash
npx promptfoo@latest eval -c promptfooconfig.questions.yaml
```

`promptfooconfig.questions.yaml` makes Jev the provider under test. It asks three questions about each support ticket in one request and asserts on the answers.

The thresholds in both configs are starting points. Tune them on your own data, and pin a model version such as `typesafe:jev-1.13.0` when you do, because `jev-latest` moves with each release.

See the [provider docs](https://www.promptfoo.dev/docs/providers/typesafe/) for all options.
