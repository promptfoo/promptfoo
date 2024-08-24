This example is pre-configured in `promptfooconfig.yaml` (both identical examples). That means you can just run:

```
promptfoo eval
```

To override prompts, providers, output, etc. you can run:

```
promptfoo eval --prompts prompt1.json prompt2.json --providers openai:chat:gpt-4o-mini --output output.json
```
