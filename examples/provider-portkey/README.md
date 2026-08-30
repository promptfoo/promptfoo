# provider-portkey (Portkey Test)

You can run this example with:

```bash
npx promptfoo@latest init --example provider-portkey
cd provider-portkey
```

There are three examples:

- prompt_example.yaml shows how to pull from portkey's prompt management platform. It requires you to set PORTKEY_API_KEY and OPENAI_API_KEY environment variables. Replace the portkey prompt with your own portkey prompt id.
- provider_example.yaml shows how to use portkey's gateway. It requires the PORTKEY_API_KEY environment variable.
- model_catalog_example.yaml shows how to reference a model from Portkey's model catalog. Replace the provider slug and model with your own. It requires the PORTKEY_API_KEY environment variable.

Then run whichever example you want, selecting its config explicitly:

```bash
promptfoo eval -c prompt_example.yaml
promptfoo eval -c provider_example.yaml
promptfoo eval -c model_catalog_example.yaml
```

Afterwards, you can view the results by running `promptfoo view`
