# github-action (GitHub Action)

You can run this example with:

```bash
npx promptfoo@latest init --example github-action
```

This folder contains a standalone GitHub Action that runs **promptfoo** when a pull request modifies prompts.

## Usage

Edit [standalone-action.yaml](./standalone-action.yaml) as needed and add it to your repository's workflow. Set the `OPENAI_API_KEY` secret so the action can evaluate your prompts.
