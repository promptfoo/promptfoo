#!/usr/bin/env python3
"""
Persistent Python wrapper for Promptfoo.

This wrapper loads a user script once and handles multiple requests
via a simple control protocol over stdin/stdout.

Protocol:
  - Node sends: "CALL|<function_name>|<request_file>|<response_file>\n"
  - Worker executes function, writes response to file
  - Worker sends: "DONE|<response_file>\n"
  - Node sends: "SHUTDOWN\n" to exit

Data transfer uses files (proven UTF-8 handling), control uses stdin/stdout.
Note: Using pipe (|) delimiter to avoid conflicts with Windows drive letters (C:).
"""

import asyncio
import importlib.util
import inspect
import json
import os
import re
import sys
import traceback
from typing import Any
from urllib.parse import quote, unquote_plus

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


def _get_otlp_traces_endpoint() -> str:
    """Resolve the standard OTLP/HTTP traces endpoint from the environment."""
    traces_endpoint = os.getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT")
    if traces_endpoint:
        return traces_endpoint

    base_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT") or "http://localhost:4318"
    normalized_endpoint = base_endpoint.rstrip("/")
    if normalized_endpoint.endswith("/v1/traces"):
        return normalized_endpoint
    return f"{normalized_endpoint}/v1/traces"


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

        provider = TracerProvider()
        exporter = OTLPSpanExporter(endpoint=_get_otlp_traces_endpoint())
        provider.add_span_processor(SimpleSpanProcessor(exporter))
        trace.set_tracer_provider(provider)

        _tracer = trace.get_tracer("promptfoo.python.provider")
        _tracing_enabled = True

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


def _use_gen_ai_latest_experimental() -> bool:
    """Check if OTEL_SEMCONV_STABILITY_OPT_IN includes gen_ai_latest_experimental."""
    val = os.getenv("OTEL_SEMCONV_STABILITY_OPT_IN", "")
    return "gen_ai_latest_experimental" in [s.strip() for s in val.split(",")]


def _gen_ai_operation_name(function_name: str, use_latest: bool) -> str:
    """Return the operation name for the selected semantic convention version."""
    if not use_latest:
        return function_name

    latest_names = {
        "call_api": "chat",
        "call_embedding_api": "embeddings",
        "call_classification_api": "chat",
        "completion": "text_completion",
        "embedding": "embeddings",
    }
    return latest_names.get(function_name, function_name)


_REDACTED_BODY_VALUE = "<REDACTED>"
_SENSITIVE_BODY_FIELD_NAMES = {
    "password",
    "passwd",
    "pwd",
    "secret",
    "secrets",
    "secretkey",
    "credentials",
    "apikey",
    "apisecret",
    "token",
    "accesstoken",
    "refreshtoken",
    "idtoken",
    "bearertoken",
    "authtoken",
    "clientsecret",
    "webhooksecret",
    "anthropicapikey",
    "awsbearertokenbedrock",
    "authorization",
    "auth",
    "bearer",
    "apikeyenvar",
    "xapikey",
    "xauthtoken",
    "xaccesstoken",
    "xauth",
    "xsecret",
    "xcsrftoken",
    "xsessiondata",
    "csrftoken",
    "sessionid",
    "session",
    "cookie",
    "setcookie",
    "certificatepassword",
    "keystorepassword",
    "pfxpassword",
    "privatekey",
    "certkey",
    "encryptionkey",
    "signingkey",
    "signature",
    "sig",
    "passphrase",
    "certificatecontent",
    "keystorecontent",
    "pfx",
    "pfxcontent",
    "keycontent",
    "certcontent",
}
_API_KEY_VALUE_PATTERN = re.compile(r"\b(?:sk|pk)-[a-zA-Z0-9._~+/=-]{20,}")
_AWS_ACCESS_KEY_PATTERN = re.compile(r"\bAKIA[A-Z0-9]{16}\b")
_SENSITIVE_BODY_VALUE_PATTERNS = [
    (_API_KEY_VALUE_PATTERN, "<REDACTED_API_KEY>"),
    (_AWS_ACCESS_KEY_PATTERN, "<REDACTED_AWS_KEY>"),
    (
        re.compile(
            r"-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?"
            r"-----END [^-\r\n]*PRIVATE KEY-----"
        ),
        "<REDACTED_PRIVATE_KEY>",
    ),
]
_BODY_ASSIGNMENT_PATTERN = re.compile(
    r"(^|[^A-Za-z0-9_-])([\"']?)([A-Za-z][A-Za-z0-9_.\-]{0,64})\2"
    r"(\s*[:=]\s*)(\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'|[^,}\r\n]+)",
    re.MULTILINE,
)
_FORM_SEGMENT_PATTERN = re.compile(r"^[A-Za-z0-9._~+%\[\]-]+=[^&;]*$")
_FORM_PAIR_PATTERN = re.compile(r"(^|[&;])([^=&;]+)=([^&;]*)")


def _normalize_body_field_name(field_name: str) -> str:
    return re.sub(r"[-_\s=]", "", field_name.lower())


def _is_sensitive_body_field(field_name: str) -> bool:
    return any(
        _normalize_body_field_name(part) in _SENSITIVE_BODY_FIELD_NAMES
        for part in re.split(r"[.\[\]]+", field_name)
        if part
    )


def _body_redaction_marker(value: Any) -> str:
    if isinstance(value, str):
        if _API_KEY_VALUE_PATTERN.search(value):
            return "<REDACTED_API_KEY>"
        if _AWS_ACCESS_KEY_PATTERN.search(value):
            return "<REDACTED_AWS_KEY>"
    return _REDACTED_BODY_VALUE


def _sanitize_json_body(text: str) -> str:
    stripped = text.strip()
    if not stripped or len(text) > 4096 * 4 or stripped[0] not in ("{", "["):
        return text
    changed = False

    def sanitize_pairs(pairs):
        nonlocal changed
        sanitized = {}
        for key, value in pairs:
            if _is_sensitive_body_field(str(key)):
                sanitized[key] = _body_redaction_marker(value)
                changed = True
            else:
                sanitized[key] = value
        return sanitized

    try:
        parsed = json.loads(text, object_pairs_hook=sanitize_pairs)
    except (TypeError, ValueError):
        return text
    if not isinstance(parsed, (dict, list)):
        return text
    return json.dumps(parsed, separators=(",", ":")) if changed else text


def _sanitize_form_body(text: str) -> str:
    if "=" not in text or any(char in text for char in "\r\n\t"):
        return text
    segments = [segment for segment in re.split(r"[&;]", text) if segment]
    if not segments or not all(
        _FORM_SEGMENT_PATTERN.fullmatch(item) for item in segments
    ):
        return text

    def replace_pair(match):
        separator, raw_key, raw_value = match.groups()
        if not raw_value:
            return match.group(0)
        decoded_key = unquote_plus(raw_key)
        if not _is_sensitive_body_field(decoded_key):
            return match.group(0)
        return f"{separator}{raw_key}={quote(_REDACTED_BODY_VALUE, safe='')}"

    return _FORM_PAIR_PATTERN.sub(replace_pair, text)


def _sanitize_body_assignments(text: str) -> str:
    def replace_assignment(match):
        prefix, key_quote, key, separator, value = match.groups()
        if not _is_sensitive_body_field(key):
            return match.group(0)
        return (
            f"{prefix}{key_quote}{key}{key_quote}{separator}"
            f"{_body_redaction_marker(value)}"
        )

    return _BODY_ASSIGNMENT_PATTERN.sub(replace_assignment, text)


def _sanitize_body(text: str) -> str:
    """Redact common credential shapes from traced request and response bodies."""
    sanitized = _sanitize_json_body(text)
    if sanitized == text:
        sanitized = _sanitize_form_body(text)
        if sanitized == text:
            sanitized = _sanitize_body_assignments(text)
    for pattern, replacement in _SENSITIVE_BODY_VALUE_PATTERNS:
        sanitized = pattern.sub(replacement, sanitized)
    return sanitized


def _truncate_body(text: Any, max_length: int = 4096) -> str:
    """Truncate text to max_length, adding indicator if truncated."""
    if not isinstance(text, str):
        text = str(text)
    sanitized = _sanitize_body(text)
    if len(sanitized) <= max_length:
        return sanitized
    return sanitized[: max_length - 13] + "... [truncated]"


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

    user_error = None
    method_called = False
    result = None

    try:
        from opentelemetry.propagate import extract
        from opentelemetry.trace import SpanKind, Status, StatusCode

        # Extract parent context from W3C traceparent header
        parent_ctx = extract({"traceparent": traceparent})

        use_latest = _use_gen_ai_latest_experimental()
        op_name = _gen_ai_operation_name(function_name, use_latest)
        options = args[1] if len(args) >= 2 and isinstance(args[1], dict) else {}
        config = options.get("config", {})
        model = config.get("model") if isinstance(config, dict) else None
        if use_latest:
            span_name = f"{op_name} {model}" if model else op_name
        else:
            span_name = f"python {function_name}"

        with _tracer.start_as_current_span(
            span_name, context=parent_ctx, kind=SpanKind.CLIENT
        ) as span:
            if use_latest:
                span.set_attribute("gen_ai.provider.name", "python")
            else:
                span.set_attribute("gen_ai.system", "python")
            span.set_attribute("gen_ai.operation.name", op_name)

            # Set request attributes from prompt (1st arg)
            if len(args) >= 1:
                prompt = args[0]
                if isinstance(prompt, str):
                    span.set_attribute("promptfoo.request.body", _truncate_body(prompt))

            # Set model from config if available (2nd arg)
            if model:
                span.set_attribute("gen_ai.request.model", model)
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
                method_called = True

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
                        if "cached" in usage:
                            span.set_attribute(
                                "gen_ai.usage.cached_tokens", usage["cached"]
                            )
                        details = usage.get("completionDetails")
                        if isinstance(details, dict):
                            if "reasoning" in details:
                                reasoning_key = (
                                    "gen_ai.usage.reasoning.output_tokens"
                                    if use_latest
                                    else "gen_ai.usage.reasoning_tokens"
                                )
                                span.set_attribute(reasoning_key, details["reasoning"])
                            if "acceptedPrediction" in details:
                                span.set_attribute(
                                    "gen_ai.usage.accepted_prediction_tokens",
                                    details["acceptedPrediction"],
                                )
                            if "rejectedPrediction" in details:
                                span.set_attribute(
                                    "gen_ai.usage.rejected_prediction_tokens",
                                    details["rejectedPrediction"],
                                )
                            if "cacheReadInputTokens" in details:
                                cache_read_key = (
                                    "gen_ai.usage.cache_read.input_tokens"
                                    if use_latest
                                    else "gen_ai.usage.cache_read_input_tokens"
                                )
                                span.set_attribute(
                                    cache_read_key, details["cacheReadInputTokens"]
                                )
                            if "cacheCreationInputTokens" in details:
                                cache_creation_key = (
                                    "gen_ai.usage.cache_creation.input_tokens"
                                    if use_latest
                                    else "gen_ai.usage.cache_creation_input_tokens"
                                )
                                span.set_attribute(
                                    cache_creation_key,
                                    details["cacheCreationInputTokens"],
                                )

                    # Cache hit
                    if "cached" in result:
                        span.set_attribute(
                            "promptfoo.cache_hit", bool(result["cached"])
                        )

                    # Handle error in result
                    if result.get("error"):
                        span.set_status(Status(StatusCode.ERROR, str(result["error"])))
                        err = result["error"]
                        if isinstance(err, dict):
                            if "code" in err:
                                error_type = err.get("code")
                            elif "type" in err:
                                error_type = err.get("type")
                            elif "status" in err:
                                error_type = err.get("status")
                            else:
                                error_type = None
                            error_type_str = (
                                str(error_type) if error_type is not None else "_OTHER"
                            )
                            span.set_attribute("error.type", error_type_str)
                        else:
                            span.set_attribute("error.type", "_OTHER")
                    elif not use_latest:
                        span.set_status(Status(StatusCode.OK))
                elif not use_latest:
                    span.set_status(Status(StatusCode.OK))

                return result

            except Exception as e:
                if method_called:
                    raise
                user_error = e
                # Record exception and set error status
                span.record_exception(e)
                span.set_status(Status(StatusCode.ERROR, str(e)))
                span.set_attribute("error.type", type(e).__name__ or "_OTHER")
                raise

    except Exception as tracing_error:
        if user_error is not None:
            raise user_error
        if method_called:
            print(
                f"[PythonProvider] Tracing error after provider call (returning result): {tracing_error}",
                file=sys.stderr,
            )
            return result

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

        # Execute user function (with automatic tracing if enabled)
        try:
            result = _traced_call(method_callable, args, function_name)
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

        # Signal completion with the response path so provider stdout cannot
        # accidentally satisfy another request's control message.
        print(f"DONE|{response_file}", flush=True)

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

            # Signal done so Node can read the error response.
            print(f"DONE|{response_file}", flush=True)
        # No DONE| when response_file is unknown: Node's path match would fail
        # and the call would resolve via timeout anyway; the stderr is the signal.


if __name__ == "__main__":
    main()
