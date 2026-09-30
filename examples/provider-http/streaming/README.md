# provider-http/streaming (HTTP Streaming and Time to First Token)

This example measures time to first displayed text (TTFT) and total response latency through Promptfoo's HTTP provider. Evaluations wait for the full response before scoring.

## Setup

```bash
npx promptfoo@latest init --example provider-http/streaming
cd provider-http/streaming
export OPENAI_API_KEY="your-openai-api-key"
```

## Run the example

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache
```

To read the key from a local `.env` file, add `--env-file .env`.

The request enables `stream: true` and uses `streamFormat: openai-chat` to measure the first content or refusal text. A response transform joins the streamed text for assertions. The example checks output length, TTFT at most 3,000 ms, and total latency at most 10,000 ms. Adjust those limits for your model and network path.

`streamFormat` also accepts `openai-responses` and `anthropic-messages`. Without it, TTFT measures the first non-whitespace response byte, which may be metadata rather than displayed text. It does not measure audio latency. Streaming requests bypass the response cache.

The example disables reasoning on `gpt-5.4-mini`; with reasoning enabled, TTFT includes time spent reasoning before text is emitted.

See the [HTTP provider documentation](https://promptfoo.dev/docs/providers/http) for request and response configuration.
