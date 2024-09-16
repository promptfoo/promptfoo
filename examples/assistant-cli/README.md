This example shows how you can use promptfoo to generate a side-by-side eval of two prompts for an ecommerce chat bot.

Configuration is in `promptfooconfig.yaml`. Run:

```
promptfoo eval
```

Full command-line equivalent:

```
promptfoo eval --prompts prompts.txt --tests tests.csv --providers openai:gpt-4o-mini --output output.json
```
