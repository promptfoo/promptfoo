---
sidebar_label: New Relic
description: Export Promptfoo eval traces to New Relic over OTLP. Set the endpoint and license key header, then explore test case and provider call spans in distributed tracing.
---

# New Relic integration

[New Relic](https://newrelic.com/) is an observability platform with a native [OTLP endpoint](https://docs.newrelic.com/docs/opentelemetry/best-practices/opentelemetry-otlp/). Promptfoo emits OpenTelemetry spans during evals and exports them to any OTLP backend, so traces reach New Relic without an agent or a collector.

## What gets exported

When tracing is enabled, Promptfoo creates a root span named `promptfoo.test_case` for every test case, plus child spans for LLM provider calls made in-process. Spans carry GenAI semantic convention attributes such as `gen_ai.provider.name`, `gen_ai.operation.name`, `gen_ai.request.model`, and token usage, alongside Promptfoo attributes like `promptfoo.eval.id`, `promptfoo.provider.id`, and `promptfoo.prompt.label`.

Traces are also written to Promptfoo's local trace store by default, so the built-in trace viewer keeps working while you export to New Relic.

## Setup

1. Get a New Relic [license key](https://docs.newrelic.com/docs/apis/intro-apis/new-relic-api-keys/). This is an ingest key, not a user API key.

2. Enable tracing in your `promptfooconfig.yaml`:

   ```yaml
   tracing:
     enabled: true
   ```

   Or set `PROMPTFOO_TRACING_ENABLED=true` in the environment.

3. Point the exporter at New Relic:

   ```bash
   export PROMPTFOO_OTEL_ENDPOINT="https://otlp.nr-data.net:4318/v1/traces"
   export OTEL_EXPORTER_OTLP_HEADERS="api-key=YOUR_NEW_RELIC_LICENSE_KEY"
   ```

   For accounts in New Relic's EU data center, use `https://otlp.eu01.nr-data.net:4318/v1/traces`.

4. Run your eval:

   ```bash
   npx promptfoo@latest eval
   ```

Promptfoo passes the endpoint URL to the OTLP exporter unchanged, so include the `/v1/traces` path. The standard `OTEL_EXPORTER_OTLP_ENDPOINT` variable works as an alternative to `PROMPTFOO_OTEL_ENDPOINT` and is treated the same way, including the full path requirement.

## Configuration reference

| Environment variable          | Purpose                                       | Default     |
| ----------------------------- | --------------------------------------------- | ----------- |
| `PROMPTFOO_TRACING_ENABLED`   | Enable tracing for the eval                   | `false`     |
| `PROMPTFOO_OTEL_ENDPOINT`     | Full OTLP HTTP traces URL, used verbatim      | unset       |
| `OTEL_EXPORTER_OTLP_HEADERS`  | Headers for the exporter, e.g. `api-key=...`  | unset       |
| `PROMPTFOO_OTEL_SERVICE_NAME` | `service.name` on exported spans              | `promptfoo` |
| `PROMPTFOO_OTEL_LOCAL_EXPORT` | Also store spans in the local trace store     | `true`      |
| `PROMPTFOO_OTEL_DEBUG`        | OpenTelemetry debug logging for export issues | `false`     |

## Viewing traces in New Relic

Open [distributed tracing](https://docs.newrelic.com/docs/distributed-tracing/ui-data/understand-use-distributed-tracing-ui/) in New Relic and select the `promptfoo` service, or whatever you set as the service name. Each eval run appears as a set of `promptfoo.test_case` traces. Filter by `promptfoo.eval.id` to isolate a single run, or facet on `gen_ai.request.model` to compare providers.

## Scope

This export covers spans Promptfoo generates itself. Spans that your application under test sends to Promptfoo's local OTLP receiver stay in the local trace store and are not forwarded. To get those into New Relic, configure your application's own OpenTelemetry exporter to send to New Relic directly. See the [tracing documentation](/docs/tracing/) for how Promptfoo propagates `traceparent` to your application.

## Troubleshooting

If spans do not appear in New Relic:

1. Set `PROMPTFOO_OTEL_DEBUG=true` to surface exporter errors.
2. Check that the endpoint region matches your account. A US license key against the EU endpoint fails, and vice versa.
3. Confirm the header value is a license key. Other key types are rejected.

## See also

- [Tracing](/docs/tracing/) for the full tracing feature, including collecting spans from your application
- [OpenTelemetry examples](https://github.com/promptfoo/promptfoo/tree/main/examples/integration-opentelemetry) in the Promptfoo repository
- [New Relic OTLP best practices](https://docs.newrelic.com/docs/opentelemetry/best-practices/opentelemetry-otlp/)
