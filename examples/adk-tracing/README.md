# adk-tracing

This example demonstrates how to use OpenTelemetry tracing with promptfoo providers. It shows both Python and JavaScript implementations of a multi-agent system with distributed tracing.

## Features

- **Python Provider**: Uses OpenTelemetry to create spans with proper trace context propagation
- **JavaScript Provider**: Alternative implementation for comparison
- **Multi-Agent System**: Demonstrates distributed tracing across multiple agent calls (process_request → research → summarize)
- **Trace Visualization**: View traces in promptfoo's UI to understand the execution flow

## Setup

1. Install dependencies:
   ```bash
   # Install Python dependencies
   pip install -r requirements.txt
   
   # Install JavaScript dependencies (optional, for JS provider)
   npm install
   ```

2. Make sure promptfoo is built with tracing support:
   ```bash
   npm run build
   ```

## Running the Examples

### Python Provider (Recommended)

The Python provider demonstrates full OpenTelemetry integration with protobuf format support:

```bash
promptfoo eval
```

This uses the default `promptfooconfig.yaml` which configures the Python provider.

### JavaScript Provider

For comparison, you can also run the JavaScript provider:

```bash
promptfoo eval -c promptfooconfig-js.yaml
```

## Viewing Traces

After running evaluations, start the web viewer:

```bash
promptfoo view
```

Then:
1. Navigate to the evaluation results
2. Click on any test case output
3. Click the "View Trace" button to see the trace timeline

## How It Works

1. **Trace Context Propagation**: Promptfoo generates a W3C traceparent header for each test case
2. **Provider Integration**: The provider extracts the trace context and creates child spans
3. **OTLP Export**: Spans are exported to promptfoo's built-in OTLP receiver
4. **Storage**: Traces are stored in promptfoo's database and associated with the evaluation
5. **Visualization**: The web UI displays traces as hierarchical timelines

## Architecture

```
promptfoo → Provider (with traceparent)
    ↓
Provider creates spans
    ↓
OTLP Exporter → promptfoo OTLP Receiver
    ↓
TraceStore → Database
    ↓
Web UI displays traces
```

## Key Files

- `provider.py`: Python provider with OpenTelemetry instrumentation
- `provider.js`: JavaScript provider alternative
- `promptfooconfig.yaml`: Configuration for Python provider
- `promptfooconfig-js.yaml`: Configuration for JavaScript provider
- `requirements.txt`: Python dependencies

## Troubleshooting

If traces don't appear:
1. Check that tracing is enabled in the config
2. Verify the OTLP receiver is running (you should see "OTLP receiver successfully started")
3. Look for span export messages in verbose output
4. Ensure spans are created within the trace context from promptfoo
