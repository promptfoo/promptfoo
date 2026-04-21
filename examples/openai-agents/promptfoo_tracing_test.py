#!/usr/bin/env python3

import importlib.util
import sys
import types
import unittest
from pathlib import Path

EXAMPLE_DIR = Path(__file__).resolve().parent
MODULE_PATH = EXAMPLE_DIR / "promptfoo_tracing.py"


def load_promptfoo_tracing():
    agents_module = types.ModuleType("agents")
    tracing_module = types.ModuleType("agents.tracing")
    processor_module = types.ModuleType("agents.tracing.processor_interface")
    spans_module = types.ModuleType("agents.tracing.spans")
    traces_module = types.ModuleType("agents.tracing.traces")

    agents_module.__version__ = "test"
    agents_module.set_trace_processors = lambda *args, **kwargs: None
    agents_module.set_tracing_disabled = lambda *args, **kwargs: None

    class TracingExporter:
        pass

    class TracingProcessor:
        pass

    class Span:
        pass

    class Trace:
        pass

    processor_module.TracingExporter = TracingExporter
    processor_module.TracingProcessor = TracingProcessor
    spans_module.Span = Span
    traces_module.Trace = Trace

    sys.modules["agents"] = agents_module
    sys.modules["agents.tracing"] = tracing_module
    sys.modules["agents.tracing.processor_interface"] = processor_module
    sys.modules["agents.tracing.spans"] = spans_module
    sys.modules["agents.tracing.traces"] = traces_module

    spec = importlib.util.spec_from_file_location(
        "promptfoo_tracing_under_test", MODULE_PATH
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {MODULE_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


PROMPTFOO_TRACING = load_promptfoo_tracing()


class FakeSpanData:
    def __init__(self, payload):
        self.payload = payload

    def export(self):
        return self.payload


class FakeSpan:
    def __init__(self, payload):
        self.trace_id = "trace_0123456789abcdef0123456789abcdef"
        self.span_id = "span_0123456789abcdef"
        self.parent_id = None
        self.started_at = "2026-04-15T12:00:00Z"
        self.ended_at = "2026-04-15T12:00:01Z"
        self.error = None
        self.trace_metadata = {}
        self.span_data = FakeSpanData(payload)


class OpaqueCustomValue:
    def __str__(self):
        return "opaque-custom-value"


def otlp_attrs(span):
    return {
        attr["key"]: next(iter(attr["value"].values())) for attr in span["attributes"]
    }


class PromptfooTracingTests(unittest.TestCase):
    def setUp(self):
        self.exporter = PROMPTFOO_TRACING.PromptfooOTLPExporter(
            "http://localhost:4318",
            "eval-1",
            "case-1",
            "feedfacefeedface",
        )

    def test_custom_sandbox_exec_span_exposes_command_attributes(self):
        span = self.exporter._span_to_otlp(
            FakeSpan(
                {
                    "type": "custom",
                    "name": "sandbox.exec",
                    "data": {
                        "sandbox.operation": "exec",
                        "command": ["python", "-m", "pytest"],
                        "exit_code": 0,
                    },
                }
            )
        )
        attrs = otlp_attrs(span)

        self.assertEqual(span["name"], "sandbox.exec")
        self.assertEqual(attrs["command"], "python -m pytest")
        self.assertEqual(attrs["sandbox.operation"], "exec")
        self.assertEqual(attrs["process.exit.code"], "0")

    def test_custom_codex_command_span_exposes_codex_command(self):
        span = self.exporter._span_to_otlp(
            FakeSpan(
                {
                    "type": "custom",
                    "name": "Codex command execution",
                    "data": {
                        "command": "sed -n '1,40p' AGENTS.md",
                        "status": "completed",
                        "exit_code": 0,
                    },
                }
            )
        )
        attrs = otlp_attrs(span)

        self.assertEqual(span["name"], "Codex command execution")
        self.assertEqual(attrs["command"], "sed -n '1,40p' AGENTS.md")
        self.assertEqual(attrs["codex.command"], "sed -n '1,40p' AGENTS.md")
        self.assertEqual(attrs["process.exit.code"], "0")

    def test_custom_span_data_handles_non_json_values(self):
        span = self.exporter._span_to_otlp(
            FakeSpan(
                {
                    "type": "custom",
                    "name": "custom",
                    "data": {
                        "opaque": OpaqueCustomValue(),
                        "nested": {"value": OpaqueCustomValue()},
                    },
                }
            )
        )
        attrs = otlp_attrs(span)

        self.assertEqual(attrs["opaque"], "opaque-custom-value")
        self.assertEqual(attrs["nested"], '{"value": "opaque-custom-value"}')


if __name__ == "__main__":
    unittest.main()
