# assistant-cli (Assistant Cli)

You can run this example with:

```sh
npx promptfoo@latest init --example assistant-cli
```

This example shows how you can use promptfoo to generate a side-by-side eval of two prompts for an e-commerce chat bot.

Configuration is in `promptfooconfig.yaml`. Run:

```sh
promptfoo eval
```

Full command-line equivalent:

```sh
promptfoo eval --prompts prompts.txt --tests tests.csv --providers openai:gpt-4.1-mini --output output.json
```
