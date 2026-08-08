# provider-tokenlab (TokenLab OpenAI-compatible Gateway)

This example shows how to evaluate models served by [TokenLab](https://tokenlab.sh/) with promptfoo's existing OpenAI provider. TokenLab exposes an OpenAI-compatible `/v1` API, so no dedicated provider plugin is required.

## Usage

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

The config includes both OpenAI-compatible chat completions and the Responses API path.

## Native Anthropic and Gemini endpoints

TokenLab also exposes Anthropic Messages and Gemini-compatible native endpoints. You don't need a custom HTTP provider for these — promptfoo's first-class providers accept a custom base URL:

```yaml
providers:
  - id: anthropic:messages:claude-sonnet-4-6
    config:
      apiBaseUrl: https://api.tokenlab.sh
      apiKey: '{{env.TOKENLAB_API_KEY}}'
  - id: google:gemini-2.5-flash
    config:
      apiBaseUrl: https://api.tokenlab.sh
      apiKey: '{{env.TOKENLAB_API_KEY}}'
```

Set `apiKey` explicitly on each provider: these providers only read their own vendor credentials (`ANTHROPIC_API_KEY` for Anthropic, `GOOGLE_API_KEY` / `GEMINI_API_KEY` for Google), so pointing them at TokenLab without `apiKey` sends an unauthenticated request even when `TOKENLAB_API_KEY` is exported.

Both providers append their own path: the Anthropic SDK requests `/v1/messages`, and the Google provider requests `/v1beta/models/<model>:generateContent`. Reach for the [`http` provider](https://www.promptfoo.dev/docs/providers/http/) only when you need a request or response shape those providers don't cover.

## Cost reporting

promptfoo looks up token prices by model name, so models that also exist in OpenAI's catalog (such as `gpt-5.5` and `gpt-5.4-mini`) are priced at OpenAI's list rates rather than TokenLab's. To report TokenLab's actual pricing, set `cost` — or `inputCost` and `outputCost` for asymmetric rates — on each provider's config:

```yaml
providers:
  - id: openai:chat:gpt-5.4-mini
    config:
      apiBaseUrl: https://api.tokenlab.sh/v1
      apiKey: '{{env.TOKENLAB_API_KEY}}'
      inputCost: 0.00000005
      outputCost: 0.0000002
```
