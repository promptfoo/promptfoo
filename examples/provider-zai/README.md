# provider-zai (Z.AI GLM)

Compare GLM-5.3, GLM-5.3-Flash, and GLM-5.3-FlashX through Z.AI's OpenAI-compatible API.

```sh
npx promptfoo@latest init --example provider-zai
cd provider-zai
export ZAI_API_KEY=your_api_key_here
promptfoo eval
```

The example uses the [pay-as-you-go endpoint](https://docs.z.ai/guides/develop/openai/python), `https://api.z.ai/api/paas/v4`. Coding Plan subscriptions use a separate endpoint and have different model access.

These models always reason. Set `config.passthrough.reasoning_effort` to `low`, `high`, or `max`; `thinking.type: disabled` is unsupported. `showThinking: false` keeps reasoning out of the graded answer. GLM-5.3 accepts text; the Flash models also accept images, video, and files. See the [GLM-5.3 guide](https://docs.z.ai/guides/llm/glm-5.3) and [Flash guide](https://docs.z.ai/guides/vlm/glm-5.3-flash).

The cost overrides use [published uncached input and output rates](https://docs.z.ai/guides/overview/pricing) in USD per token. The generic OpenAI provider does not apply Z.AI's prompt-cache discounts, so cached requests can cost less than the estimate.
