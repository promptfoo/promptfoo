# config-multishot (Multishot)

You can run this example with:

```bash
npx promptfoo@latest init --example config-multishot
cd config-multishot
```

## Usage

This example is pre-configured in `promptfooconfig.yaml` (both identical examples). That means you can just run:

```bash
promptfoo eval
```

To override prompts, providers, output, etc. you can run:

```bash
promptfoo eval --prompts prompt1.json prompt2.json --providers openai:chat:gpt-4.1-mini --output output.json
```
