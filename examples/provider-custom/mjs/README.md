# provider-custom/mjs (Custom Provider Mjs)

You can run this example with:

```bash
npx promptfoo@latest init --example provider-custom/mjs
cd provider-custom/mjs
```

## Usage

This example uses a custom API provider in `customProvider.mjs`. It also uses CSV test cases.

Run:

```bash
promptfoo eval
```

Full command-line equivalent:

```bash
promptfoo eval --prompts prompts.txt --tests vars.csv --providers openai:chat --output output.json --providers customProvider.js
```
