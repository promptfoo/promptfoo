To get started, set your OPENROUTER_API_KEY environment variable.

This command will run the eval specified in `promptfooconfig.yaml`:

```
promptfoo eval
```

Afterwards, you can view the results by running `promptfoo view`

To run a red team, edit `redteamconfig.yaml` and then run:

```
promptfoo redteam run -c redteamconfig.yaml
```

Read more here: https://www.promptfoo.dev/blog/deepseek-censorship/
