# provider-custom/typescript (Custom Provider Typescript)

You can run this example with:

```bash
npx promptfoo@latest init --example provider-custom/typescript
cd provider-custom/typescript
```

## Usage

This example uses a custom API provider in `customProvider.ts`. It also uses CSV test cases.

Run:

```bash
promptfoo eval
```

Full command-line equivalent:

```bash
promptfoo eval --prompts prompts.txt --tests vars.csv --providers openai:chat --output output.json --providers customProvider.js
```
