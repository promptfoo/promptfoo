# decision-assertions (Provider-independent Decision Checks)

## Usage

Compare OpenAI Decisions and TypeSafe Jev using the same value and confidence assertions:

```sh
npx promptfoo@latest init --example decision-assertions
cd decision-assertions
# Set OPENAI_API_KEY and TYPESAFE_API_KEY in your environment.
npx promptfoo@latest eval --no-cache -o results.json
```

This makes paid requests to both providers. Remove a provider to run only the other one.

The providers already exist in Promptfoo: [OpenAI Decisions](https://www.promptfoo.dev/docs/providers/openai-decisions/) and [TypeSafe Jev](https://www.promptfoo.dev/docs/providers/typesafe/). Their output transforms select the named `category` answer and expose its choice as `value`, retaining the answer's other fields. The tests share `equals` for the selected value and `numeric` for the inclusive confidence range. Other providers can use the same assertions after mapping their output to this shape.

The `0.8` cutoff is illustrative. Choose thresholds on labeled data for each provider; equal confidence values do not establish equal accuracy across models. Confidence and the probability of a particular choice are separate fields. OpenAI predicates and Jev Nouls return probabilities without confidence: check their numeric value, and do not invent a confidence field. A missing confidence fails `numeric` and `not-numeric`.

For score answers, map `score` to `value` and use a `numeric` range on `output.value`. Scores retain each provider's rubric scale; this example does not rescale scores or probabilities.
