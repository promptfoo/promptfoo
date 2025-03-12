This example uses a custom API provider in `customProvider.ts`. It also uses CSV test cases.

Run:

```
promptfoo eval
```

Full command-line equivalent:

```
promptfoo eval --prompts prompts.txt --tests vars.csv --providers openai:chat --output output.json --providers customProvider.js
```
