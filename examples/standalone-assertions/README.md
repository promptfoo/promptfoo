To get started, have a look at `asserts.yaml`

If you use a model-graded eval, you must set your OPENAI_API_KEY environment variable or override the provider (see https://promptfoo.dev/docs/configuration/expected-outputs/model-graded/#overriding-the-llm-grader).

Then run:

```
promptfoo eval --assertions asserts.yaml --model-outputs outputs.json
```

`outputs-with-tags.json` shows a different JSON format that allows you to show basic string metadata in the web UI view.

Afterwards, you can view the results by running `promptfoo view`
