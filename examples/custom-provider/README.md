This example uses a custom API provider in `customProvider.js`. It also uses CSV test cases.

Run:

```sh
promptfoo eval
```

Full command-line equivalent:

```sh
promptfoo eval --prompts prompts.txt --tests vars.csv --providers openai:chat --output output.json --providers customProvider.js
```
