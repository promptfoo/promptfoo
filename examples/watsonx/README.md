To get started, set your `WATSONX_AI_APIKEY` or `WATSONX_AI_BEARER_TOKEN`, and `WATSONX_AI_PROJECT_ID` environment variables.

Follow the instructions in [watsonx.md](../../site/docs/providers/watsonx.md) to retrieve your API keys, bearer token, and project ID.

Next, edit promptfooconfig.yaml.

Then run:

```
npm run local -- eval --config examples/watsonx/promptfooconfig.yaml
```

or

```
promptfoo eval
```

Afterwards, you can view the results by running `promptfoo view`
