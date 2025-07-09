# adk-tracing

Python multi-agent system with OpenTelemetry tracing for promptfoo.

```bash
npx promptfoo@latest init --example adk-tracing
```

## Overview

This example demonstrates:
- Python provider with OpenTelemetry instrumentation
- Multi-agent workflow with hierarchical traces
- Integration with promptfoo's evaluation framework

## Quick Start

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Run the evaluation:
   ```bash
   npx promptfoo eval
   ```

3. View results:
   ```bash
   npx promptfoo view
   ```

## How It Works

The `provider.py` file implements a simple multi-agent system:

1. **Main Process** - Coordinates the request processing
2. **Research Agent** - Simulates information gathering
3. **Summary Agent** - Creates an executive summary

Each operation creates OpenTelemetry spans:

```
[process_request]
  ├─[research]
  └─[summarize]
```

## Known Limitations

Python's OTLP exporter sends data in protobuf format, while promptfoo's OTLP receiver currently expects JSON format. This means:
- Trace data is generated but may not display in the UI
- You'll see "Protobuf format not yet supported" warnings
- The provider functions correctly despite these warnings

For full trace visualization, consider using:
- A JavaScript/TypeScript provider (see opentelemetry-tracing example)
- An external OpenTelemetry collector that accepts protobuf

## Configuration

The `promptfooconfig.yaml` file:
- Uses the Python provider (`python:provider.py`)
- Tests the multi-agent output
- Enables OpenTelemetry tracing (with limitations noted above)

## Learn More

- [promptfoo Python Providers](https://promptfoo.dev/docs/providers/python)
- [OpenTelemetry Python](https://opentelemetry.io/docs/languages/python/)
