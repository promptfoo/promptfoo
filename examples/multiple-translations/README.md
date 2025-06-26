# multiple-translations (Multiple Translations)

Evaluate translation quality across multiple languages using standard promptfoo evals and [scenarios](https://www.promptfoo.dev/docs/configuration/scenarios/).

You can run this example with:

```bash
npx promptfoo@latest init --example multiple-translations
cd multiple-translations
```

## Environment Variables

Set at least one API key:

- `OPENAI_API_KEY` - Your OpenAI API key
- `ANTHROPIC_API_KEY` - Your Anthropic API key

## Usage

**Array-based testing (default):**

```bash
promptfoo eval
promptfoo view
```

**Scenario-based testing:**

```bash
promptfoo eval -c promptfooconfig-scenarios.yaml
promptfoo view
```
