# provider-cohere (Cohere)

You can run this example with:

```bash
npx promptfoo@latest init --example provider-cohere
cd provider-cohere
```

## Usage

To get started, set your COHERE_API_KEY environment variable.

The starter uses Command A for text generation and Embed v3 for similarity grading. It does not require managed web search, which [Cohere deprecated for new integrations](https://docs.cohere.com/docs/deprecations).

Next, edit promptfooconfig.yaml.

Then run:

```bash
promptfoo eval
```

Or

```bash
promptfoo eval -c complex_config.yaml
```

Afterwards, you can view the results by running `promptfoo view`
