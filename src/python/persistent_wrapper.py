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
import math
import os
import re
import sys
import traceback
from typing import Any, Optional, Tuple
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
        # OTel defines `chat` specifically for chat completion. Classification
        # has no predefined operation, so use the allowed custom operation name.
        "call_classification_api": "classification",
        "completion": "text_completion",
        "embedding": "embeddings",
    }
    return latest_names.get(function_name, function_name)


_REDACTED_BODY_VALUE = "<REDACTED>"
_REDACTED_OVERSIZED_BODY_VALUE = "<REDACTED_OVERSIZED_BODY>"
_REDACTED_OVERSIZED_JSON_VALUE = "<REDACTED_OVERSIZED_JSON>"
_REDACTED_UNSANITIZABLE_JSON_VALUE = "<REDACTED_UNSANITIZABLE_JSON>"
_MAX_BODY_SANITIZE_LENGTH = 256 * 1024
_SENSITIVE_BODY_FIELD_NAMES = {
    "key",
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
    "proxyauthorization",
    "ocpapimsubscriptionkey",
    "subscriptionkey",
    "xfunctionskey",
    "functionkey",
    "githubtoken",
    "hftoken",
    "huggingfacetoken",
    "databrickstoken",
    "awssessiontoken",
    "xamzsecuritytoken",
    "awssecretaccesskey",
    "secretaccesskey",
}
_SENSITIVE_BODY_FIELD_SUFFIXES = (
    "apikey",
    "apisecret",
    "apitoken",
    "accesstoken",
    "refreshtoken",
    "idtoken",
    "bearertoken",
    "authtoken",
    "sessiontoken",
    "csrftoken",
    "clientsecret",
    "webhooksecret",
    "secretkey",
    "password",
    "passwd",
    "pwd",
    "credentials",
    "accesskey",
    "accesskeyid",
    "privatekey",
    "certkey",
    "encryptionkey",
    "signingkey",
    "signature",
    "passphrase",
    "subscriptionkey",
    "functionskey",
    "authorization",
)
_API_KEY_VALUE_PATTERN = re.compile(r"\b(?:sk|pk)-[a-zA-Z0-9._~+/=-]{20,}")
_AWS_ACCESS_KEY_PATTERN = re.compile(r"\bAKIA[A-Z0-9]{16}\b")
_GOOGLE_API_KEY_PATTERN = re.compile(r"\bAIza[0-9A-Za-z_-]{10,}")
_GITHUB_TOKEN_PATTERN = re.compile(r"\bgh[pousr]_[A-Za-z0-9_]{20,}")
_HUGGINGFACE_TOKEN_PATTERN = re.compile(r"\bhf_[A-Za-z0-9]{20,}")
_DATABRICKS_TOKEN_PATTERN = re.compile(r"\bdapi[A-Za-z0-9]{20,}")
_SENSITIVE_BODY_VALUE_PATTERNS = [
    (_API_KEY_VALUE_PATTERN, "<REDACTED_API_KEY>"),
    (_GOOGLE_API_KEY_PATTERN, "<REDACTED_API_KEY>"),
    (_GITHUB_TOKEN_PATTERN, "<REDACTED_TOKEN>"),
    (_HUGGINGFACE_TOKEN_PATTERN, "<REDACTED_TOKEN>"),
    (_DATABRICKS_TOKEN_PATTERN, "<REDACTED_TOKEN>"),
    (_AWS_ACCESS_KEY_PATTERN, "<REDACTED_AWS_KEY>"),
]
_BODY_ASSIGNMENT_START_PATTERN = re.compile(
    r"(^|[^A-Za-z0-9_-])([\"']?)([A-Za-z][A-Za-z0-9_.\-]{0,64})\2"
    r"(\s*[:=]\s*)",
    re.MULTILINE,
)
_BODY_ASSIGNMENT_VALUE_PATTERN = re.compile(
    r"\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'|[^,}\r\n]+"
)
_BODY_ASSIGNMENT_TOKEN_VALUE_PATTERN = re.compile(
    r"\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'|[^\s,}&;]+"
)
_FORM_SEGMENT_PATTERN = re.compile(r"^[A-Za-z0-9._~+%\[\]-]+=[^&;]*$")
_FORM_PAIR_PATTERN = re.compile(r"(^|[&;])([^=&;]+)=([^&;]*)")
_JSON_STRING_PROPERTY_PATTERN = re.compile(
    r'("(?:\\.|[^"\\])*")(\s*:\s*)'
    r'("(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)'
)
_JSON_STRING_TOKEN_PATTERN = re.compile(r'"(?:\\.|[^"\\])*"')
_JSON_NUMBER_TOKEN_PATTERN = re.compile(r"-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?")
_URL_QUERY_PAIR_PATTERN = re.compile(r"([?&])([^=&#\s]+)=([^&#\s]*)")
_URL_USERINFO_PATTERN = re.compile(
    r"(\b[a-zA-Z][a-zA-Z0-9+.-]*://)[^/\s?#]+@(?=[^/\s?#])"
)
_PRIVATE_KEY_BEGIN_PATTERN = re.compile(r"-----BEGIN [^-\r\n]*PRIVATE KEY-----")
_PRIVATE_KEY_END_PATTERN = re.compile(r"-----END [^-\r\n]*PRIVATE KEY-----")


def _normalize_body_field_name(field_name: str) -> str:
    return re.sub(r"[-_\s=]", "", field_name.lower())


def _looks_like_opaque_credential(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    unquoted = value.strip("\"'")
    return (
        len(unquoted) >= 16
        and not any(char.isspace() for char in unquoted)
        and unquoted.lower() not in {"true", "false", "null", "undefined"}
    )


def _exceeds_body_sanitization_limit(text: str) -> bool:
    return len(text) > _MAX_BODY_SANITIZE_LENGTH or len(
        text.encode("utf-8", errors="surrogatepass")
    ) > (_MAX_BODY_SANITIZE_LENGTH)


def _is_sensitive_body_field(field_name: str, value: Any = None) -> bool:
    for part in re.split(r"[.\[\]]+", field_name):
        if not part:
            continue
        normalized = _normalize_body_field_name(part)
        if isinstance(value, bool) or (
            isinstance(value, str) and value.lower() in {"true", "false"}
        ):
            continue
        if normalized == "key":
            if _looks_like_opaque_credential(value):
                return True
            continue
        if normalized in _SENSITIVE_BODY_FIELD_NAMES:
            return True
        suffix = next(
            (
                candidate
                for candidate in _SENSITIVE_BODY_FIELD_SUFFIXES
                if normalized.endswith(candidate)
            ),
            None,
        )
        if suffix in {"accesskey", "accesskeyid"}:
            if _looks_like_opaque_credential(value):
                return True
            continue
        if suffix is not None:
            return True
    return False


def _could_be_sensitive_body_field(field_name: str) -> bool:
    for part in re.split(r"[.\[\]]+", field_name):
        if not part:
            continue
        normalized = _normalize_body_field_name(part)
        if (
            normalized == "key"
            or normalized in _SENSITIVE_BODY_FIELD_NAMES
            or normalized.endswith(_SENSITIVE_BODY_FIELD_SUFFIXES)
        ):
            return True
    return False


def _body_redaction_marker(value: Any) -> str:
    if isinstance(value, str):
        if _API_KEY_VALUE_PATTERN.search(value):
            return "<REDACTED_API_KEY>"
        if _AWS_ACCESS_KEY_PATTERN.search(value):
            return "<REDACTED_AWS_KEY>"
        if any(
            pattern.search(value)
            for pattern in (
                _GOOGLE_API_KEY_PATTERN,
                _GITHUB_TOKEN_PATTERN,
                _HUGGINGFACE_TOKEN_PATTERN,
                _DATABRICKS_TOKEN_PATTERN,
            )
        ):
            return "<REDACTED_TOKEN>"
    return _REDACTED_BODY_VALUE


def _sanitize_url_query_credentials(text: str) -> str:
    def replace_query_credential(match):
        key = unquote_plus(match.group(2))
        value = unquote_plus(match.group(3))
        is_opaque_generic_credential = key.lower() in {
            "code",
            "key",
        } and _looks_like_opaque_credential(value)
        if (
            not _is_sensitive_body_field(key, value)
            and not is_opaque_generic_credential
        ):
            return match.group(0)
        return (
            f"{match.group(1)}{match.group(2)}={quote(_REDACTED_BODY_VALUE, safe='')}"
        )

    return _URL_QUERY_PAIR_PATTERN.sub(replace_query_credential, text)


def _sanitize_url_userinfo_credentials(text: str) -> str:
    return _URL_USERINFO_PATTERN.sub(rf"\1{_REDACTED_BODY_VALUE}@", text)


def _redact_private_keys(text: str) -> str:
    replacements = []
    cursor = 0
    scan_position = 0
    while True:
        begin = _PRIVATE_KEY_BEGIN_PATTERN.search(text, scan_position)
        if begin is None:
            break
        end = _PRIVATE_KEY_END_PATTERN.search(text, begin.end())
        replacements.extend((text[cursor : begin.start()], "<REDACTED_PRIVATE_KEY>"))
        if end is None:
            cursor = len(text)
            break
        cursor = end.end()
        scan_position = cursor
    return "".join(replacements) + text[cursor:] if replacements else text


def _apply_sensitive_value_patterns(text: str) -> str:
    sanitized = _redact_private_keys(text)
    for pattern, replacement in _SENSITIVE_BODY_VALUE_PATTERNS:
        sanitized = pattern.sub(replacement, sanitized)
    return sanitized


def _sanitize_unstructured_body_text(text: str) -> str:
    form_body = _sanitize_form_body(text)
    sanitized = form_body if form_body is not None else _sanitize_body_assignments(text)
    return _apply_sensitive_value_patterns(
        _sanitize_url_query_credentials(_sanitize_url_userinfo_credentials(sanitized))
    )


def _sanitize_parsed_json(value: Any) -> Tuple[Any, bool]:
    if isinstance(value, str):
        sanitized = _sanitize_unstructured_body_text(value)
        return sanitized, sanitized != value
    if isinstance(value, list):
        changed = False
        sanitized_items = []
        for item in value:
            sanitized, item_changed = _sanitize_parsed_json(item)
            sanitized_items.append(sanitized)
            changed = changed or item_changed
        return sanitized_items, changed
    if not isinstance(value, dict):
        return value, False

    changed = False
    sanitized_dict = {}
    for key, child in value.items():
        if _is_sensitive_body_field(str(key), child):
            sanitized_dict[key] = _body_redaction_marker(child)
            changed = True
            continue
        sanitized, child_changed = _sanitize_parsed_json(child)
        sanitized_dict[key] = sanitized
        changed = changed or child_changed
    return sanitized_dict, changed


def _has_unsafe_json_numbers(text: str) -> bool:
    without_strings = _JSON_STRING_TOKEN_PATTERN.sub('""', text)
    for match in _JSON_NUMBER_TOKEN_PATTERN.finditer(without_strings):
        token = match.group(0)
        try:
            value = float(token)
        except (OverflowError, ValueError):
            return True
        if not math.isfinite(value):
            return True
        significand = re.split(r"[eE]", token, maxsplit=1)[0]
        significand = significand.replace("-", "").replace(".", "")
        if value == 0 and any(char != "0" for char in significand):
            return True
        has_fraction_or_exponent = any(char in token for char in ".eE")
        if not has_fraction_or_exponent and abs(int(token)) > (2**53 - 1):
            return True
        if has_fraction_or_exponent and len(significand.lstrip("0")) > 15:
            return True
    return False


def _sanitize_json_body(text: str) -> Optional[str]:
    stripped = text.strip()
    if not stripped or stripped[0] not in ("{", "["):
        return None
    try:
        parsed = json.loads(text)
    except RecursionError:
        return _REDACTED_UNSANITIZABLE_JSON_VALUE
    except (TypeError, ValueError):
        return None
    if not isinstance(parsed, (dict, list)):
        return None
    try:
        sanitized, changed = _sanitize_parsed_json(parsed)
        if changed and _has_unsafe_json_numbers(text):
            return _REDACTED_UNSANITIZABLE_JSON_VALUE
        return (
            json.dumps(sanitized, separators=(",", ":"), allow_nan=False)
            if changed
            else text
        )
    except (TypeError, ValueError, RecursionError):
        return _REDACTED_UNSANITIZABLE_JSON_VALUE


def _sanitize_json_string_properties(text: str) -> str:
    def replace_property(match):
        raw_key, separator, raw_value = match.groups()
        try:
            key = json.loads(raw_key)
            value = json.loads(raw_value)
        except (TypeError, ValueError):
            return match.group(0)
        if _is_sensitive_body_field(str(key), value):
            return (
                f"{raw_key}{separator}"
                f"{json.dumps(_body_redaction_marker(value), separators=(',', ':'))}"
            )
        if isinstance(value, str):
            sanitized = _sanitize_unstructured_body_text(value)
            if sanitized != value:
                return f"{raw_key}{separator}{json.dumps(sanitized, separators=(',', ':'))}"
        return match.group(0)

    return _JSON_STRING_PROPERTY_PATTERN.sub(replace_property, text)


def _sanitize_form_body(text: str) -> Optional[str]:
    if "=" not in text or any(char in text for char in "\r\n\t"):
        return None
    segments = [segment for segment in re.split(r"[&;]", text) if segment]
    if not segments or not all(
        _FORM_SEGMENT_PATTERN.fullmatch(item) for item in segments
    ):
        return None

    def replace_pair(match):
        separator, raw_key, raw_value = match.groups()
        if not raw_value:
            return match.group(0)
        decoded_key = unquote_plus(raw_key)
        try:
            decoded_value = unquote_plus(raw_value)
        except (TypeError, ValueError):
            decoded_value = raw_value
        if _is_sensitive_body_field(decoded_key, decoded_value):
            return f"{separator}{raw_key}={quote(_REDACTED_BODY_VALUE, safe='')}"
        sanitized_raw_value = _apply_sensitive_value_patterns(
            _sanitize_url_query_credentials(_sanitize_body_assignments(raw_value))
        )
        if sanitized_raw_value != raw_value:
            return f"{separator}{raw_key}={sanitized_raw_value}"
        sanitized_value = _apply_sensitive_value_patterns(
            _sanitize_url_query_credentials(_sanitize_body_assignments(decoded_value))
        )
        if sanitized_value == decoded_value:
            return match.group(0)
        return f"{separator}{raw_key}={quote(sanitized_value, safe='')}"

    return _FORM_PAIR_PATTERN.sub(replace_pair, text)


def _sanitize_body_assignments(text: str) -> str:
    replacements = []
    cursor = 0
    scan_position = 0
    while True:
        match = _BODY_ASSIGNMENT_START_PATTERN.search(text, scan_position)
        if match is None:
            break
        prefix, key_quote, key, separator = match.groups()
        if not _could_be_sensitive_body_field(key):
            scan_position = max(match.start() + 1, match.end() - 1)
            continue
        token_value_match = _BODY_ASSIGNMENT_TOKEN_VALUE_PATTERN.match(
            text, match.end()
        )
        if token_value_match is None or not _is_sensitive_body_field(
            key, token_value_match.group(0)
        ):
            scan_position = match.end()
            continue
        value_match = _BODY_ASSIGNMENT_VALUE_PATTERN.match(text, match.end())
        if value_match is None:
            scan_position = match.end()
            continue

        value = value_match.group(0)

        replacements.append(text[cursor : match.start()])
        replacements.append(
            f"{prefix}{key_quote}{key}{key_quote}{separator}"
            f"{_body_redaction_marker(value)}"
        )
        cursor = value_match.end()
        scan_position = cursor

    return "".join(replacements) + text[cursor:] if replacements else text


def _sanitize_body(text: str) -> str:
    """Redact common credential shapes from traced request and response bodies."""
    if _exceeds_body_sanitization_limit(text):
        return (
            _REDACTED_OVERSIZED_JSON_VALUE
            if re.match(r"^\s*[\[{]", text)
            else _REDACTED_OVERSIZED_BODY_VALUE
        )
    sanitized = _sanitize_json_body(text)
    if sanitized is None:
        sanitized = _sanitize_json_string_properties(text)
        # Malformed or mixed-format bodies can contain both JSON-like fields and
        # assignment-form credentials. Scan the partially sanitized result so a
        # JSON property match cannot short-circuit later credential redaction.
        sanitized = _sanitize_unstructured_body_text(sanitized)
    return _apply_sensitive_value_patterns(
        _sanitize_url_query_credentials(_sanitize_url_userinfo_credentials(sanitized))
    )


def _truncate_body(text: Any, max_length: int = 4096) -> str:
    """Truncate text to max_length, adding indicator if truncated."""
    if not isinstance(text, str):
        text = str(text)
    sanitized = _sanitize_body(text)
    if len(sanitized) <= max_length:
        return sanitized
    return sanitized[: max_length - 13] + "... [truncated]"


def _normalize_error_type(value: Any) -> Optional[str]:
    """Return a bounded low-cardinality error type, or None for unsafe values."""
    if isinstance(value, str):
        normalized = value.strip()
        return normalized if 0 < len(normalized) <= 128 else None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(value) if math.isfinite(value) else None
    return None


def _traced_call(method_callable, args, function_name):
    """
    Call method with OpenTelemetry tracing if enabled.

    Extracts traceparent from context (3rd arg) and creates a child span
    that links to the parent trace from Promptfoo.
    """
    global _tracer, _tracing_enabled

    context_arg = args[2] if len(args) >= 3 and isinstance(args[2], dict) else None
    api_type = (
        context_arg.get("__promptfooApiType") if isinstance(context_arg, dict) else None
    )
    is_two_argument_api = api_type in {
        "call_embedding_api",
        "call_classification_api",
    }
    is_cached_result = (
        isinstance(context_arg, dict) and context_arg.get("__promptfooCached") is True
    )
    method_args = args[:2] if is_two_argument_api else args

    # Fast path: if tracing not enabled, just call the method
    if not _tracing_enabled or _tracer is None:
        return call_method(method_callable, method_args)

    # Extract traceparent from Promptfoo's internal third argument. Embedding
    # and classification callbacks keep their public two-argument signature.
    traceparent = None
    tracestate = None
    if context_arg:
        traceparent = context_arg.get("traceparent")
        tracestate = context_arg.get("tracestate")

    # If no traceparent, fall back to untraced call
    if not traceparent:
        return call_method(method_callable, method_args)

    user_error = None
    method_called = False
    result = None

    try:
        from opentelemetry.propagate import extract
        from opentelemetry.trace import SpanKind, Status, StatusCode

        # Extract parent context from W3C traceparent header
        carrier = {"traceparent": traceparent}
        if isinstance(tracestate, str) and tracestate:
            carrier["tracestate"] = tracestate
        parent_ctx = extract(carrier)

        use_latest = _use_gen_ai_latest_experimental()
        semantic_function_name = (
            api_type
            if api_type in {"call_api", "call_embedding_api", "call_classification_api"}
            else function_name
        )
        op_name = _gen_ai_operation_name(semantic_function_name, use_latest)
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
                result = call_method(method_callable, method_args)
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

                    response_metadata = result.get("metadata")
                    if isinstance(response_metadata, dict):
                        response_model = response_metadata.get("model")
                        response_id = response_metadata.get("responseId")
                        conversation_id = response_metadata.get("conversationId")
                        if isinstance(response_model, str) and response_model:
                            span.set_attribute("gen_ai.response.model", response_model)
                        if (
                            isinstance(response_id, str)
                            and response_id
                            and (not use_latest or response_id != conversation_id)
                        ):
                            span.set_attribute("gen_ai.response.id", response_id)
                        if (
                            use_latest
                            and isinstance(conversation_id, str)
                            and conversation_id
                        ):
                            span.set_attribute(
                                "gen_ai.conversation.id", conversation_id
                            )
                    finish_reason = result.get("finishReason")
                    if isinstance(finish_reason, str) and finish_reason:
                        span.set_attribute(
                            "gen_ai.response.finish_reasons", [finish_reason]
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
                    if is_cached_result:
                        span.set_attribute("promptfoo.cache_hit", True)
                    elif "cached" in result:
                        span.set_attribute(
                            "promptfoo.cache_hit", bool(result["cached"])
                        )

                    # Handle error in result
                    err = result.get("error")
                    has_error = (isinstance(err, str) and bool(err)) or isinstance(
                        err, (dict, list)
                    )
                    metadata = result.get("metadata")
                    http = metadata.get("http") if isinstance(metadata, dict) else None
                    http_status = http.get("status") if isinstance(http, dict) else None
                    http_error_type = (
                        _normalize_error_type(http_status)
                        if isinstance(http_status, int)
                        and not isinstance(http_status, bool)
                        and 400 <= http_status <= 599
                        else None
                    )
                    if has_error:
                        if isinstance(err, str):
                            error_message = _truncate_body(err)
                        elif isinstance(err, dict) and isinstance(
                            err.get("message"), str
                        ):
                            error_message = _truncate_body(err["message"])
                        else:
                            error_message = "Provider error"
                        span.set_status(Status(StatusCode.ERROR, error_message))

                        error_type = None
                        if isinstance(err, dict):
                            for field in ("code", "type", "status"):
                                error_type = _normalize_error_type(err.get(field))
                                if error_type is not None:
                                    break
                        if error_type is None:
                            error_type = http_error_type
                        span.set_attribute(
                            "error.type",
                            error_type if error_type is not None else "_OTHER",
                        )
                    elif http_error_type is not None:
                        span.set_status(Status(StatusCode.ERROR, f"HTTP {http_status}"))
                        span.set_attribute("error.type", http_error_type)
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
                error_message = _truncate_body(str(e))
                error_type = _normalize_error_type(type(e).__name__) or "_OTHER"
                span.add_event(
                    "exception",
                    {
                        "exception.type": error_type,
                        "exception.message": error_message,
                    },
                )
                span.set_status(Status(StatusCode.ERROR, error_message))
                span.set_attribute("error.type", error_type)
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
        return call_method(method_callable, method_args)


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

        # Read request
        with open(request_file, "r", encoding="utf-8") as f:
            args = json.load(f)

        if function_name == "__promptfoo_trace_cached_result":
            context_arg = args[2] if len(args) >= 3 else None
            if not isinstance(context_arg, dict):
                raise ValueError("Cached trace request is missing its context")
            cached_result = args[3] if len(args) >= 4 else None
            api_type = context_arg.get("__promptfooApiType")
            if api_type not in {
                "call_api",
                "call_embedding_api",
                "call_classification_api",
            }:
                raise ValueError("Cached trace request has an invalid API type")

            def return_cached_result(*_args):
                return cached_result

            method_callable = return_cached_result
            function_name = api_type
        else:
            # Resolve the user's callable for this call.
            method_callable = get_callable(user_module, function_name)

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
