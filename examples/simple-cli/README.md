This example is pre-configured in `promptfooconfig.yaml`. That means you can just run:

```bash
npx promptfoo@latest init --example simple-cli
# or simply
promptfoo eval
```

To override prompts, providers, output, etc. you can run:

```
promptfoo eval --prompts prompts.txt --providers openai:chat --output output.json
```
