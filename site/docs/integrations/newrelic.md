---
title: New Relic tracing integration
sidebar_label: New Relic
sidebar_position: 100
description: Export Promptfoo eval traces to New Relic over OTLP. Configure an ingest key and endpoint, then inspect test-case and provider spans in distributed tracing.
---

# New Relic integration

[New Relic](https://newrelic.com/) is an observability platform with a native [OTLP endpoint](https://docs.newrelic.com/docs/opentelemetry/best-practices/opentelemetry-otlp/). Promptfoo exports eval spans as OTLP/HTTP JSON. An OpenTelemetry Collector receives those spans and forwards them to New Relic using its recommended OTLP/HTTP protobuf transport.

## What gets exported

When tracing is enabled, Promptfoo creates a root span named `promptfoo.test_case` for every test case, plus child spans for instrumented LLM provider calls made in-process. Spans carry GenAI semantic convention attributes such as `gen_ai.provider.name`, `gen_ai.operation.name`, `gen_ai.request.model`, and token usage, alongside Promptfoo attributes like `promptfoo.eval.id`, `promptfoo.provider.id`, and `promptfoo.prompt.label`.

Traces are also written to Promptfoo's local trace store by default, so the built-in trace viewer keeps working while you export to New Relic.

## Setup

1. Get a New Relic [license key](https://docs.newrelic.com/docs/apis/intro-apis/new-relic-api-keys/). This is an ingest key, not a user API key.

2. Enable tracing in your `promptfooconfig.yaml`:

   ```yaml
   tracing:
     enabled: true
   ```

   Or set `PROMPTFOO_TRACING_ENABLED=true` in the environment.

3. Install the [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/installation/) and save this configuration as `otelcol.yaml`:

   ```yaml
   receivers:
     otlp:
       protocols:
         http:
           endpoint: 127.0.0.1:4318
   exporters:
     otlp_http/newrelic:
       endpoint: https://otlp.nr-data.net:4318
       headers:
         api-key: ${env:NEW_RELIC_LICENSE_KEY}
   service:
     pipelines:
       traces:
         receivers: [otlp]
         exporters: [otlp_http/newrelic]
   ```

   For New Relic's EU data center, set the exporter endpoint to `https://otlp.eu01.nr-data.net:4318`.

4. Start the Collector with the ingest key in its environment:

   ```bash
   otelcol --config otelcol.yaml
   ```

5. Point Promptfoo at the Collector's full traces URL and run the eval:

   ```bash
   export PROMPTFOO_OTEL_ENDPOINT="http://127.0.0.1:4318/v1/traces"
   npx promptfoo@latest eval
   ```

   If another local process uses port 4318, change the Collector receiver port and the Promptfoo endpoint together.

## Configuration reference

| Environment variable          | Purpose                                       | Default     |
| ----------------------------- | --------------------------------------------- | ----------- |
| `PROMPTFOO_TRACING_ENABLED`   | Enable tracing for the eval                   | `false`     |
| `PROMPTFOO_OTEL_ENDPOINT`     | Full OTLP HTTP traces URL, used verbatim      | unset       |
| `PROMPTFOO_OTEL_SERVICE_NAME` | `service.name` on exported spans              | `promptfoo` |
| `PROMPTFOO_OTEL_LOCAL_EXPORT` | Also store spans in the local trace store     | `true`      |
| `PROMPTFOO_OTEL_DEBUG`        | OpenTelemetry debug logging for export issues | `false`     |

## Viewing traces in New Relic

Open [distributed tracing](https://docs.newrelic.com/docs/distributed-tracing/ui-data/understand-use-distributed-tracing-ui/) in New Relic and select the `promptfoo` service, or whatever you set as the service name. Each eval run appears as a set of `promptfoo.test_case` traces. Filter by `promptfoo.eval.id` to isolate a single run, or facet on `gen_ai.request.model` to compare providers.

## Scope

This export covers spans Promptfoo generates itself. Spans that your application under test sends to Promptfoo's local OTLP receiver stay in the local trace store and are not forwarded. To get those into New Relic, configure your application's own OpenTelemetry exporter to send to New Relic directly. See the [tracing documentation](/docs/tracing/) for how Promptfoo propagates `traceparent` to your application.

## Troubleshooting

If spans do not appear in New Relic:

1. Set `PROMPTFOO_OTEL_DEBUG=true` to surface errors reaching the Collector. Check the Collector logs for errors forwarding to New Relic.
2. Check that the endpoint region matches your account. A US license key against the EU endpoint fails, and vice versa.
3. Confirm the Collector has `NEW_RELIC_LICENSE_KEY` in its environment and that the value is a license key.

## See also

- [Tracing](/docs/tracing/) for the full tracing feature, including collecting spans from your application
- [OpenTelemetry examples](https://github.com/promptfoo/promptfoo/tree/main/examples/integration-opentelemetry) in the Promptfoo repository
- [New Relic OTLP best practices](https://docs.newrelic.com/docs/opentelemetry/best-practices/opentelemetry-otlp/)
