This example shows how you can use promptfoo to generate a side-by-side eval of multiple prompts to compare GPT 3 and GPT 4 outputs.

Configure in `promptfooconfig.yaml`. Run with:

```
promptfoo eval
```

Full command-line equivalent:

```
promptfoo eval --prompts prompts.txt --providers openai:gpt-3.5-turbo openai:gpt-4
```
