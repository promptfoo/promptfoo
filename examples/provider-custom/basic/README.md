# provider-custom/basic (Custom Provider)

You can run this example with:

```bash
npx promptfoo@latest init --example provider-custom/basic
cd provider-custom/basic
```

## Usage

This example uses a custom API provider in `customProvider.js`. It also uses CSV test cases.

Run:

```bash
promptfoo eval
```

Full command-line equivalent:

```bash
promptfoo eval --prompts prompts.txt --tests vars.csv --providers openai:chat --output output.json --providers customProvider.js
```
