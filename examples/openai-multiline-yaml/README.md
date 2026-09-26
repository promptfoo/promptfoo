# openai-multiline-yaml (OpenAI Multiline YAML)

This example uses GPT-6 Luna with a travel assistant's system and user messages in `prompt.yaml`. YAML's `|` syntax keeps the multiline system prompt readable.

## Usage

```bash
npx promptfoo@latest init --example openai-multiline-yaml
cd openai-multiline-yaml
export OPENAI_API_KEY=your-key-here
npx promptfoo@latest eval --no-cache
```

Edit `prompt.yaml` to change the instructions and `promptfooconfig.yaml` to change the test inputs.
