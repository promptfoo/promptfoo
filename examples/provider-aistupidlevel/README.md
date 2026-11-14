# provider-aistupidlevel (AI Stupid Level)

Compare three AI Stupid Level routing modes on the same prompts, using promptfoo's OpenAI-compatible provider. Each mode picks a model per request from continuously re-run benchmarks, and calls it with your own provider keys.

## Usage

```bash
npx promptfoo@latest init --example provider-aistupidlevel
cd provider-aistupidlevel
```

Create a router key at [aistupidlevel.info/router/keys](https://aistupidlevel.info/router/keys) and set `ASL_ROUTER_KEY` in your environment. For live answers, add at least one provider key to your account. To test routing with only a router key, add `X-ASL-Sandbox: 'true'` under `headers` before running the eval.

```bash
npx promptfoo@latest eval
```

In sandbox mode the router returns mock answers and does not charge for model calls. The assertions check live answers and may fail on mock output.

See the [provider guide](https://www.promptfoo.dev/docs/providers/aistupidlevel/) for configuration details.
