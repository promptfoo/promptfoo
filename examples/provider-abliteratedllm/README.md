# provider-abliteratedllm (AbliteratedLLM)

Compare GLM-5.3 Flash Abliterated with the stock GLM-5.3 Flash on AbliteratedLLM, using promptfoo's OpenAI-compatible provider.

## Usage

```bash
npx promptfoo@latest init --example provider-abliteratedllm
cd provider-abliteratedllm
```

Create a key on the [AbliteratedLLM API keys page](https://abliteratedllm.dev/dashboard/keys) and set `ABLITERATEDLLM_API_KEY` in your environment. Then run:

```bash
npx promptfoo@latest eval
```

With a trial key, add `--max-concurrency 1`; trial accounts run one request at a time.

Both models use `max_tokens: 2048` and low reasoning effort. Reasoning tokens count toward the limit; increase it if a model runs out before answering. `showThinking: false` keeps reasoning out of the graded answer.

The abliterated model has refusal behavior removed; review its outputs before using it in an application. For current model IDs, see the [models reference](https://abliteratedllm.dev/docs/models). See the [provider guide](https://www.promptfoo.dev/docs/providers/abliteratedllm/) for configuration details.
