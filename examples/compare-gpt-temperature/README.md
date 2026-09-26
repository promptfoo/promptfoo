# compare-gpt-temperature (GPT-6 Luna Temperature Comparison)

This example compares temperatures `0` and `1` with GPT-6 Luna through the Responses API. Both providers set reasoning effort to `none`, which enables temperature sampling.

You can run this example with:

```bash
npx promptfoo@latest init --example compare-gpt-temperature
cd compare-gpt-temperature
```

## Usage

Set `OPENAI_API_KEY`, then run:

```bash
npx promptfoo@latest eval --no-cache
```

Afterwards, you can view the results by running `npx promptfoo@latest view`
