# Pi Scorer

`pi` is a more accurate alternative to "LLM as a judge" evaluation. It can quickly, and accurately,
evaluate input and output pairs against any criteria.

## How to use it

To use the `pi` assertion type, add it to your test configuration like this:

```yaml
assert:
  - type: pi
    # Specify the criteria for grading the LLM output.  Criteria can be a string
    value: Is the response not apologetic and provides a clear, concise answer?
```

This assertion will use the pi scorer to grade the output based on the specified criteria.

Make sure to set the `WITHPI_API_KEY` in your environment variables. You can create a key for free here:
https://build.withpi.ai/account/keys

## How it works

Under the hood, the `pi` assertion uses the `withpi` sdk to call the to evaluate the output based on the criteria you provide.

Compared to LLM as a judge:

- The inputs of the eval are the same: `llm_input` and `llm_output`
- Pi does not need a system prompt, and is pretrained to score
- Pi always generates the same score, when given the same input

## Threshold Support

The `pi` assertion type supports an optional `threshold` property that sets a minimum score requirement. When specified, the output must achieve a score greater than or equal to the threshold to pass. For example:

The default threshold is `.5`

```yaml
assert:
  - type: pi
    value: Is not apologetic and provides a clear, concise answer
    threshold: 0.8 # Requires a score of 0.8 or higher to pass
```

## Metrics Brainstorming

You can optionally use the [Pi Labs Copilot](https://build.withpi.ai) to interactively brainstorm
representative metrics for your application. Additionally, it can help
you test your Pi metrics out on generated examples before integrating into your stack.


## Further reading

See [Pi Documentation](https://docs.withpi.ai) for more options, scorer configuration, and calibration.
