This example shows how you can use promptfoo to generate a side-by-side eval of two prompts for an ecommerce chat bot.

Configuration is in `promptfooconfig.yaml`. Run:

```sh
promptfoo eval
```

Full command-line equivalent:

```sh
promptfoo eval --prompts prompts.txt --tests tests.csv --providers openai:gpt-3.5-turbo --output output.json
```
