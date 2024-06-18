This example is pre-configured in `promptfooconfig.yaml` (both identical examples). That means you can just run:

```sh
promptfoo eval
```

To override prompts, providers, output, etc. you can run:

```sh
promptfoo eval --prompts prompt1.json prompt2.json --providers openai:chat:gpt-3.5-turbo --output output.json
```
