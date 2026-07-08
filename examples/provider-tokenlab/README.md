# provider-tokenlab (TokenLab OpenAI-compatible Gateway)

This example shows how to evaluate models served by [TokenLab](https://tokenlab.sh/) with promptfoo's existing OpenAI provider. TokenLab exposes an OpenAI-compatible `/v1` API, so no dedicated provider plugin is required.

You can initialize this example with:

```sh
npx promptfoo@latest init --example provider-tokenlab
cd provider-tokenlab
```

Set your TokenLab API key:

```sh
export TOKENLAB_API_KEY=sk-...
```

Run the example:

```sh
promptfoo eval
```

The config includes both OpenAI-compatible chat completions and the Responses API path. TokenLab also exposes Anthropic Messages and Gemini-compatible native endpoints; use those native endpoints in custom HTTP providers when your evaluation needs provider-specific request or response shapes.
