This example is pre-configured in `promptfooconfig.yaml` (both identical examples). That means you can just run:

```bash
npx promptfoo@latest init --example multishot
# or simply
promptfoo eval
```

To override prompts, providers, output, etc. you can run:

```
promptfoo eval --prompts prompt1.json prompt2.json --providers openai:chat:gpt-4o-mini --output output.json
```
