This example uses a custom API provider in `customProvider.mjs`. It also uses CSV test cases.

Run:

```bash
npx promptfoo@latest init --example custom-provider-mjs
# or simply
promptfoo eval
```

Full command-line equivalent:

```
promptfoo eval --prompts prompts.txt --tests vars.csv --providers openai:chat --output output.json --providers customProvider.js
```
