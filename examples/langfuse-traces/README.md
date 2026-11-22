# langfuse-traces (Evaluate Stored Outputs)

## Setup

Start with `npx promptfoo@latest init --example langfuse-traces`, then enter the created directory.

Copy `.env.example` to `.env` and fill in your Langfuse API keys. Install the optional client, then run the example:

```bash
npm install @langfuse/client
npx promptfoo@latest eval -c promptfooconfig.yaml --env-file .env --no-cache
```

The example loads ten traces and checks that each stored output is nonempty. It skips the response provider. Inputs and outputs are saved in local results; use care when exporting or sharing production data. Adding model-graded assertions can send trace data to the grading provider.

See the [Langfuse integration docs](https://promptfoo.dev/docs/integrations/langfuse#evaluating-langfuse-traces) for filters and available variables.
