This example shows how you can use promptfoo to generate a side-by-side eval of multiple prompts to compare gpt-4o and gpt-4o-mini outputs.

Configure in `promptfooconfig.yaml`. Run with:

```bash
npx promptfoo@latest init --example gpt-4o-vs-4o-mini
# or simply
promptfoo eval
```

Full command-line equivalent:

```
promptfoo eval --prompts prompts.txt --providers openai:gpt-4o openai:gpt-4o-mini
```
