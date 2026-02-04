#!/usr/bin/env python3
"""
Persistent Python wrapper for Promptfoo.

This wrapper loads a user script once and handles multiple requests
via a simple control protocol over stdin/stdout.

Protocol:
  - Node sends: "CALL|<function_name>|<request_file>|<response_file>\n"
  - Worker executes function, writes response to file
  - Worker sends: "DONE\n"
  - Node sends: "SHUTDOWN\n" to exit

Data transfer uses files (proven UTF-8 handling), control uses stdin/stdout.
Note: Using pipe (|) delimiter to avoid conflicts with Windows drive letters (C:).
"""

import asyncio
import importlib.util
import inspect
import json
import os
import sys
import traceback

# Load promptfoo_logger from the same directory without mutating sys.path.
# Register in sys.modules so user scripts can still `from promptfoo_logger import logger`.
_wrapper_dir = os.path.dirname(os.path.abspath(__file__))
_logger_path = os.path.join(_wrapper_dir, "promptfoo_logger.py")
if not os.path.isfile(_logger_path):
    raise ImportError(
        f"promptfoo_logger.py not found at {_logger_path}. "
        "This file should have been installed alongside persistent_wrapper.py."
    )
_logger_spec = importlib.util.spec_from_file_location("promptfoo_logger", _logger_path)
_logger_mod = importlib.util.module_from_spec(_logger_spec)
_logger_spec.loader.exec_module(_logger_mod)
sys.modules["promptfoo_logger"] = _logger_mod

inject_logger_into_provider_context = _logger_mod.inject_logger_into_provider_context
strip_logger_from_result = _logger_mod.strip_logger_from_result

# ============================================================================
# OpenTelemetry Tracing Support (Optional)
# ============================================================================
# When PROMPTFOO_ENABLE_OTEL=true, automatically instruments Python provider
# calls with OpenTelemetry spans that link to the parent trace from Promptfoo.
#
# Requirements (optional):
#   pip install opentelemetry-api opentelemetry-sdk opentelemetry-exporter-otlp-proto-http
# ============================================================================

_tracer = None
_tracing_enabled = False


def _init_tracing():
    """Initialize OpenTelemetry tracing if enabled and packages are available."""
    global _tracer, _tracing_enabled

    if os.getenv("PROMPTFOO_ENABLE_OTEL", "").lower() not in ("true", "1", "yes"):
        return

    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
            OTLPSpanExporter,
        )
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import SimpleSpanProcessor

        # Get endpoint from environment or use default Promptfoo OTLP receiver
        base_endpoint = os.getenv(
            "OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318"
        )
        endpoint = f"{base_endpoint.rstrip('/')}/v1/traces"

        provider = TracerProvider()
        exporter = OTLPSpanExporter(endpoint=endpoint)
        provider.add_span_processor(SimpleSpanProcessor(exporter))
        trace.set_tracer_provider(provider)

        _tracer = trace.get_tracer("promptfoo.python.provider")
        _tracing_enabled = True

        print(
            f"[PythonProvider] OpenTelemetry tracing enabled, endpoint: {endpoint}",
            file=sys.stderr,
            flush=True,
        )
    except ImportError:
        print(
            "[PythonProvider] OpenTelemetry packages not installed, tracing disabled. "
            "Install with: pip install opentelemetry-api opentelemetry-sdk opentelemetry-exporter-otlp-proto-http",
            file=sys.stderr,
            flush=True,
        )
    except Exception as e:
        print(
            f"[PythonProvider] Failed to initialize tracing: {e}",
            file=sys.stderr,
            flush=True,
        )


# Initialize tracing at module load
_init_tracing()


def load_user_module(script_path):
    """Load and return the user's Python module."""
    script_dir = os.path.dirname(os.path.abspath(script_path))
    module_name = os.path.basename(script_path).rsplit(".", 1)[0]

    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)

    spec = importlib.util.spec_from_file_location(module_name, script_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load module from {script_path}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    return module


def get_callable(module, method_name):
    """Get the callable method from module, supporting 'Class.method' syntax."""
    try:
        if "." in method_name:
            class_name, classmethod_name = method_name.split(".", 1)
            cls = getattr(module, class_name)
            return getattr(cls, classmethod_name)
        else:
            return getattr(module, method_name)
    except AttributeError as e:
        # Provide helpful error message when function not found
        available_funcs = [
            name
            for name in dir(module)
            if callable(getattr(module, name, None)) and not name.startswith("_")
        ]

        error_lines = [
            f"Function '{method_name}' not found in module '{module.__name__}'",
            "",
            f"Available functions in your module: {', '.join(available_funcs) if available_funcs else '(none)'}",
            "",
            "Expected function names for promptfoo:",
            "  • call_api(prompt, options, context) - for chat/completions",
            "  • call_embedding_api(prompt, options) - for embeddings",
            "  • call_classification_api(prompt, options) - for classification",
            "",
        ]

        # Fuzzy match suggestion
        if available_funcs:
            # Check for common mistakes
            method_lower = method_name.lower()
            for func in available_funcs:
                func_lower = func.lower()
                # Check if user used 'get_' instead of 'call_'
                if method_lower.replace("call_", "") == func_lower.replace("get_", ""):
                    error_lines.append(
                        f"💡 Did you mean to rename '{func}' to '{method_name}'?"
                    )
                    break
                # Check if function name is similar (missing 'call_' prefix)
                elif method_lower.replace("call_", "") == func_lower:
                    error_lines.append(
                        f"💡 Did you mean to rename '{func}' to '{method_name}'?"
                    )
                    break
                # Check if it's just a typo (Levenshtein-like)
                elif (
                    len(set(method_lower) & set(func_lower)) > len(method_lower) * 0.6
                    and abs(len(method_lower) - len(func_lower)) <= 3
                ):
                    error_lines.append(f"💡 Did you mean '{func}'?")
                    break

        error_lines.append(
            "\nSee https://www.promptfoo.dev/docs/providers/python/ for details."
        )

        raise AttributeError("\n".join(error_lines)) from e


def call_method(method_callable, args):
    """Call the method, handling both sync and async functions."""
    if inspect.iscoroutinefunction(method_callable):
        return asyncio.run(method_callable(*args))
    else:
        return method_callable(*args)


def _truncate_body(text, max_length=4096):
    """Truncate text to max_length, adding indicator if truncated."""
    if not isinstance(text, str):
        text = str(text)
    if len(text) <= max_length:
        return text
    return text[: max_length - 13] + "... [truncated]"


def _traced_call(method_callable, args, function_name):
    """
    Call method with OpenTelemetry tracing if enabled.

    Extracts traceparent from context (3rd arg) and creates a child span
    that links to the parent trace from Promptfoo.
    """
    global _tracer, _tracing_enabled

    # Fast path: if tracing not enabled, just call the method
    if not _tracing_enabled or _tracer is None:
        return call_method(method_callable, args)

    # Extract traceparent from context (3rd argument for call_api)
    traceparent = None
    context_arg = None
    if len(args) >= 3:
        context_arg = args[2]
        if isinstance(context_arg, dict):
            traceparent = context_arg.get("traceparent")

    # If no traceparent, fall back to untraced call
    if not traceparent:
        return call_method(method_callable, args)

    try:
        from opentelemetry.propagate import extract
        from opentelemetry.trace import SpanKind, Status, StatusCode

        # Extract parent context from W3C traceparent header
        parent_ctx = extract({"traceparent": traceparent})

        # Determine span name following GenAI conventions
        span_name = f"python {function_name}"

        with _tracer.start_as_current_span(
            span_name, context=parent_ctx, kind=SpanKind.CLIENT
        ) as span:
            # Set GenAI semantic convention attributes
            span.set_attribute("gen_ai.system", "python")
            span.set_attribute("gen_ai.operation.name", function_name)

            # Set request attributes from prompt (1st arg)
            if len(args) >= 1:
                prompt = args[0]
                if isinstance(prompt, str):
                    span.set_attribute("promptfoo.request.body", _truncate_body(prompt))

            # Set model from config if available (2nd arg)
            if len(args) >= 2:
                options = args[1]
                if isinstance(options, dict):
                    config = options.get("config", {})
                    if config.get("model"):
                        span.set_attribute("gen_ai.request.model", config["model"])
                    # Also check for provider id
                    if options.get("id"):
                        span.set_attribute("promptfoo.provider.id", options["id"])

            # Set evaluation metadata from context
            if context_arg:
                if context_arg.get("evaluationId"):
                    span.set_attribute("promptfoo.eval.id", context_arg["evaluationId"])
                if context_arg.get("testCaseId"):
                    span.set_attribute("promptfoo.test.id", context_arg["testCaseId"])

            try:
                # Execute the user's function
                result = call_method(method_callable, args)

                # Set response attributes
                if isinstance(result, dict):
                    # Response body
                    if "output" in result:
                        output = result["output"]
                        if isinstance(output, str):
                            span.set_attribute(
                                "promptfoo.response.body", _truncate_body(output)
                            )
                        elif output is not None:
                            span.set_attribute(
                                "promptfoo.response.body",
                                _truncate_body(json.dumps(output)),
                            )

                    # Token usage following GenAI conventions
                    if "tokenUsage" in result and isinstance(
                        result["tokenUsage"], dict
                    ):
                        usage = result["tokenUsage"]
                        if "total" in usage:
                            span.set_attribute(
                                "gen_ai.usage.total_tokens", usage["total"]
                            )
                        if "prompt" in usage:
                            span.set_attribute(
                                "gen_ai.usage.input_tokens", usage["prompt"]
                            )
                        if "completion" in usage:
                            span.set_attribute(
                                "gen_ai.usage.output_tokens", usage["completion"]
                            )

                    # Cache hit
                    if "cached" in result:
                        span.set_attribute(
                            "promptfoo.cache_hit", bool(result["cached"])
                        )

                    # Handle error in result
                    if result.get("error"):
                        span.set_status(Status(StatusCode.ERROR, str(result["error"])))
                    else:
                        span.set_status(Status(StatusCode.OK))
                else:
                    span.set_status(Status(StatusCode.OK))

                return result

            except Exception as e:
                # Record exception and set error status
                span.record_exception(e)
                span.set_status(Status(StatusCode.ERROR, str(e)))
                raise

    except Exception as tracing_error:
        # If tracing itself fails, log and fall back to untraced call
        print(
            f"[PythonProvider] Tracing error (continuing without trace): {tracing_error}",
            file=sys.stderr,
            flush=True,
        )
        return call_method(method_callable, args)


def main():
    if len(sys.argv) < 3:
        print(
            "Usage: persistent_wrapper.py <script_path> <function_name>",
            file=sys.stderr,
        )
        sys.exit(1)

    script_path = sys.argv[1]
    function_name = sys.argv[2]

    # Load user module once
    try:
        user_module = load_user_module(script_path)
        # Note: We don't validate the default function exists at initialization.
        # With the persistent worker protocol supporting dynamic function calls per request,
        # users may only define specific functions (e.g., call_embedding_api for embeddings-only).
        # Functions are validated when actually called in handle_call(), providing clear
        # error messages with available functions and suggestions.
    except Exception as e:
        print(f"ERROR: Failed to load module: {e}", file=sys.stderr, flush=True)
        print(traceback.format_exc(), file=sys.stderr, flush=True)
        sys.exit(1)

    # Signal ready
    print("READY", flush=True)

    # Main loop - wait for commands
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                # stdin closed, exit gracefully
                break

            line = line.strip()

            if line.startswith("SHUTDOWN"):
                break
            elif line.startswith("CALL|"):
                handle_call(line, user_module, function_name)
            else:
                print(f"ERROR: Unknown command: {line}", file=sys.stderr, flush=True)

        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"ERROR in main loop: {e}", file=sys.stderr, flush=True)
            print(traceback.format_exc(), file=sys.stderr, flush=True)


def handle_call(command_line, user_module, default_function_name):
    """Handle a CALL command."""
    response_file = None
    try:
        # Parse command: "CALL|<function_name>|<request_file>|<response_file>"
        # or legacy: "CALL|<request_file>|<response_file>"
        # Note: Using pipe (|) delimiter to avoid conflicts with Windows drive letters (C:)
        parts = command_line.split("|", 3)

        # Extract response_file first (always the last part) so it's available even if validation fails
        # This ensures we can write an error response file if command format is invalid
        if len(parts) >= 3:
            response_file = parts[-1]

        if len(parts) == 4:
            # New format: CALL|<function_name>|<request_file>|<response_file>
            _, function_name, request_file, _ = parts
        elif len(parts) == 3:
            # Legacy format: CALL|<request_file>|<response_file>
            _, request_file, _ = parts
            function_name = default_function_name
        else:
            raise ValueError(f"Invalid CALL command format: {command_line}")

        # Resolve the callable for this call
        method_callable = get_callable(user_module, function_name)

        # Read request
        with open(request_file, "r", encoding="utf-8") as f:
            args = json.load(f)

        # Inject logger into the context arg only (not options) for provider access
        args = inject_logger_into_provider_context(args)

        # Execute user function (with automatic tracing if enabled)
        try:
            result = _traced_call(method_callable, args, function_name)
            # Strip non-serializable transient keys before JSON serialization
            result = strip_logger_from_result(result)
            response = {"type": "result", "data": result}
        except Exception as e:
            response = {
                "type": "error",
                "error": str(e),
                "traceback": traceback.format_exc(),
            }

        # Write response
        with open(response_file, "w", encoding="utf-8") as f:
            json.dump(response, f, ensure_ascii=False)
            f.flush()  # Flush Python buffer
            os.fsync(f.fileno())  # Force OS to write to disk (critical for Windows)

        # Verify file is readable before signaling done (prevents race conditions)
        # Retry up to 3 times with small delays if file isn't immediately readable
        for verify_attempt in range(3):
            try:
                with open(response_file, "r", encoding="utf-8") as f:
                    _ = f.read()
                break  # Successfully read, exit retry loop
            except Exception as e:
                if verify_attempt < 2:
                    import time

                    time.sleep(0.1)  # 100ms delay before retry
                    continue
                # Final attempt failed
                print(
                    f"ERROR: Failed to verify response file after 3 attempts: {e}",
                    file=sys.stderr,
                    flush=True,
                )
                # Still send DONE to avoid hanging Node, but Node will handle missing file

        # Signal done
        print("DONE", flush=True)

    except Exception as e:
        print(f"ERROR handling call: {e}", file=sys.stderr, flush=True)
        print(traceback.format_exc(), file=sys.stderr, flush=True)

        # Write error response if we have response_file
        # This ensures Node.js always has a file to read, preventing ENOENT errors
        # when errors occur before the normal response file write (e.g., invalid command,
        # non-existent function, file I/O errors)
        if response_file:
            try:
                error_response = {
                    "type": "error",
                    "error": str(e),
                    "traceback": traceback.format_exc(),
                }
                with open(response_file, "w", encoding="utf-8") as f:
                    json.dump(error_response, f, ensure_ascii=False)
                    f.flush()
                    os.fsync(f.fileno())
            except Exception as write_error:
                print(
                    f"ERROR: Failed to write error response: {write_error}",
                    file=sys.stderr,
                    flush=True,
                )

        # Signal done after attempting to write error
        print("DONE", flush=True)


if __name__ == "__main__":
    main()
