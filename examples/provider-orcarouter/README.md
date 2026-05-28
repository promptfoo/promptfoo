# provider-orcarouter (OrcaRouter Provider)

This example shows how to use [OrcaRouter](https://www.orcarouter.ai/), an OpenAI-compatible adaptive routing gateway, to evaluate prompts against multiple upstream models through a single endpoint.

You can run this example with:

```bash
npx promptfoo@latest init --example provider-orcarouter
cd provider-orcarouter
```

## Setup

1. Get your API key from [OrcaRouter](https://www.orcarouter.ai/).
2. Set your API key:

   ```bash
   export ORCAROUTER_API_KEY=your_api_key_here
   ```

3. Run the evaluation:

   ```bash
   npx promptfoo@latest eval
   ```

## What this example does

This example demonstrates:

- Calling a specific upstream model (`openai/gpt-5.5`) through OrcaRouter.
- Using the `orcarouter:orcarouter/auto` adaptive router, which picks an upstream per request according to the workspace-level strategy configured in the [routing console](https://www.orcarouter.ai/console/routing).

For the full model catalog, see [orcarouter.ai/models](https://www.orcarouter.ai/models). For provider docs, see the [OrcaRouter provider page](https://www.promptfoo.dev/docs/providers/orcarouter).
