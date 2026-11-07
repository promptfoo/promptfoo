# provider-aistupidlevel (AI Stupid Level)

Compare three AI Stupid Level routing modes on the same prompts, using promptfoo's OpenAI-compatible provider. Each mode picks a model per request from continuously re-run benchmarks, and calls it with your own provider keys.

## Usage

```bash
npx promptfoo@latest init --example provider-aistupidlevel
cd provider-aistupidlevel
```

Create a router key at [aistupidlevel.info/router/keys](https://aistupidlevel.info/router/keys), add at least one provider key to your account, and set `ASL_ROUTER_KEY` in your environment. Then run:

```bash
npx promptfoo@latest eval
```

To check the setup without calling any provider, add `X-ASL-Sandbox: 'true'` under `headers`: the router runs its real routing and returns a mock answer, and nothing is spent. The assertions fail on mock answers.

See the [provider guide](https://www.promptfoo.dev/docs/providers/aistupidlevel/) for configuration details.
