# provider-nace (Nace Drex Max)

Drex is nace.ai's family of decision models. Like TypeSafe's Jev, a Drex model answers typed questions with probabilities instead of generating text, which makes it a fast grader and classifier. Drex Max also reads images.

You can run this example with:

```bash
npx promptfoo@latest init --example provider-nace
cd provider-nace
```

## Usage

Set `NACE_API_KEY`. You can create a key in the [Nace console](https://console.nace.ai/dashboard/api-keys).

```bash
export NACE_API_KEY=your_api_key_here
```

### Grade and classify outputs

```bash
npx promptfoo@latest eval
```

`promptfooconfig.yaml` uses the `echo` provider to return two canned support replies, then grades them with Drex Max:

- `llm-rubric` sends each rubric as a yes/no (Noul) question. The score is the probability that the rubric holds.
- `llm-rubric` with `levels` sends a Score question and scales the result to 0–1.
- `classifier` sends a Choice question and checks the probability of one label.

Drex doesn't return a rationale, so each `reason` states how the verdict was derived, such as `Drex Noul probability 0.99 >= threshold 0.5`.

### Test your own Drex questions

```bash
npx promptfoo@latest eval -c promptfooconfig.questions.yaml
```

`promptfooconfig.questions.yaml` makes Drex Max the provider under test. It asks three questions about each support ticket in one request and asserts on the answers.

To ask about images, add `images` to the provider config. Each entry is an image file path, a data URL, or, for `llm-rubric` and the provider itself, a template such as `{{photo}}` that renders a `file://` image var, and questions refer to them as "Image 1", "Image 2", and so on. See the [provider docs](https://www.promptfoo.dev/docs/providers/nace/) for an example.

The thresholds in both configs are starting points. Tune them on your own data. `drex-max` is a pinned model id; `drex-latest` is an alias that points to the text-only `drex-v2.0`, not to Drex Max.

See the [provider docs](https://www.promptfoo.dev/docs/providers/nace/) for all options.
