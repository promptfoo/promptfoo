# provider-portkey (Portkey Test)

Install the example:

```bash
npx promptfoo@latest init --example provider-portkey
cd provider-portkey
```

Choose a config and set its required environment variables:

| Config                       | Purpose                                                                                               | Required environment variables      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `prompt_example.yaml`        | Load a saved Portkey prompt and call OpenAI. Replace the prompt ID with your own.                     | `PORTKEY_API_KEY`, `OPENAI_API_KEY` |
| `provider_example.yaml`      | Call OpenAI through the Portkey gateway.                                                              | `PORTKEY_API_KEY`, `OPENAI_API_KEY` |
| `model_catalog_example.yaml` | Use credentials stored in Portkey's model catalog. Replace the provider slug and model with your own. | `PORTKEY_API_KEY`                   |

Run the selected config:

```bash
promptfoo eval -c prompt_example.yaml
promptfoo eval -c provider_example.yaml
promptfoo eval -c model_catalog_example.yaml
```

Run `promptfoo view` to inspect the results.
