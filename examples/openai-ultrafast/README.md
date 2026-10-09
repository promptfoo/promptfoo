# openai-ultrafast (Sol Standard vs. Ultrafast)

Compare GPT-6.1 Sol's Standard and Ultrafast service tiers on a support agent's next-action selection. Both providers use the same prompt, reasoning effort, and output budget; only `service_tier` differs. The assertions check action accuracy and illustrative latency and cost budgets.

## Run

Set `OPENAI_API_KEY` in your environment, then initialize the example:

```sh
npx promptfoo@latest init --example openai-ultrafast
```

From the generated example directory, run:

```sh
npx promptfoo@latest eval --no-cache --repeat 5 --max-concurrency 1 -o results.json
```

For development in the Promptfoo repository, run from the repository root:

```sh
npm run local -- eval -c examples/openai-ultrafast/promptfooconfig.yaml --no-cache --repeat 5 --max-concurrency 1 -o results.json
```

The run makes 30 paid requests. Add `--env-file .env` only if you keep your key in that file. Ultrafast costs [six times Standard token rates](https://developers.openai.com/api/docs/models/gpt-6.1-sol); change the sample budgets to match your application before interpreting pass/fail results.

## Compare the results

Inspect each entry in `results.json`'s `results.results` array for provider errors, action accuracy, `latencyMs`, `response.raw.service_tier`, `response.tokenUsage`, and `response.cost`. Check the returned tier for fallbacks before grouping results. Compare median and tail latency alongside accuracy and cost per successful task. Missing cost data is not zero cost. Five repeats are a smoke test; expand the dataset and sample count before choosing a tier.

Replace these short cases with representative production inputs, including long prompts, realistic outputs, and tool calls. Hold reasoning effort, region, concurrency, and cache conditions constant. `--no-cache` disables Promptfoo's result cache; it does not disable the API's prompt cache. Repeat at different times and reverse provider order to check for timing effects. Use Ultrafast for interactive work when the measured time saved justifies its premium.

Promptfoo's Responses provider uses HTTP and measures request completion latency. OpenAI [recommends persistent WebSockets](https://developers.openai.com/api/docs/guides/ultrafast-mode) for frequent tool calls. For a streaming or multi-turn application, also evaluate its real transport and tool execution to measure time to first output and end-to-end workflow gains.

## Regional endpoints and Bedrock

For an eligible US or EU OpenAI project, set the same `apiBaseUrl` on both providers to `https://us.api.openai.com/v1` or `https://eu.api.openai.com/v1`. GPT-6.1 Sol Ultrafast supports both regions and global processing. See [OpenAI's Ultrafast guide](https://developers.openai.com/api/docs/guides/ultrafast-mode).

For Bedrock, use `bedrock:openai.gpt-6.1-sol` for both provider IDs and add `region: us-east-1` to both configurations. Keep the `default` and `ultrafast` tiers. Configure Bedrock authentication as described in the [Bedrock provider guide](https://www.promptfoo.dev/docs/providers/aws-bedrock/#openai-models); OpenAI API keys do not authenticate Bedrock requests. Bedrock availability and pricing follow the [AWS model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-6-1-sol.html).
