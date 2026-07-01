# provider-zhipu (Zhipu AI / GLM)

You can run this example with:

```bash
npx promptfoo@latest init --example provider-zhipu
cd provider-zhipu
```

## Usage

Set your `ZHIPU_API_KEY` environment variable. You can get a key from the [Z.ai platform](https://z.ai/) (international) or the [Zhipu open platform](https://open.bigmodel.cn/usercenter/apikeys) (China mainland).

Then run:

```bash
promptfoo eval
```

View the results with `promptfoo view`.

## What this shows

- Two GLM models on one `ZHIPU_API_KEY`, with the GLM-native reasoning toggle:
  - `glm-5.2` with **reasoning on** (`thinking: { type: enabled }` + `showThinking: true`) — the model reasons first and that reasoning shows up in the output.
  - `glm-4.6` with **reasoning off** (`thinking: { type: disabled }`) — an older model answering directly, fewer tokens.
- `icontains-any` assertions on the output — exercising chat and the GLM thinking control with nothing but a `ZHIPU_API_KEY`. Free-tier users without paid balance can swap in `zhipu:glm-4.5-flash`.

Zhipu exposes an OpenAI-compatible API, so standard options (`temperature`, `max_tokens`, …) work as usual. The provider defaults to the international `https://api.z.ai/api/paas/v4` endpoint; mainland users can set `apiBaseUrl` to `https://open.bigmodel.cn/api/paas/v4`. Model names rotate over time; if one 404s, pick a current id from the [GLM model list](https://docs.z.ai/guides/llm/glm-5.2).
