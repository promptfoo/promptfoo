"""
Promptfoo Logger and context utilities for Python hooks.

Provides:
  1. A structured JSON logger whose output is parsed by the Node.js wrapper
     and routed to the appropriate log level in promptfoo's logging system.
  2. Helper functions for injecting/stripping the logger from call arguments,
     used by both wrapper.py (one-shot scripts) and persistent_wrapper.py
     (long-lived workers).

Usage:
    from promptfoo_logger import logger

    logger.info("Test started", {"testId": "123"})
    logger.debug("Debug info")
    logger.warn("Something unexpected")
    logger.error("An error occurred", {"error": str(e)})
"""

import json
import sys
from typing import Any, Dict, List, Optional

# Special marker that Node.js looks for to identify structured log messages
LOG_MARKER = "__PROMPTFOO_LOG__"

# Protocol version for structured log messages
LOG_PROTOCOL_VERSION = 1


class PromptfooLogger:
    """
    A logger that outputs JSON-formatted messages for the Node.js wrapper to parse.

    Log messages are written to stderr to avoid interfering with the function's
    return value communication (which uses stdout via file).
    """

    def _emit(self, log_json: str) -> None:
        """Write a log line to stderr, with fallback for I/O errors."""
        try:
            print(log_json, file=sys.stderr)
            sys.stderr.flush()
        except Exception:
            # Last resort: try writing a plain-text fallback
            try:
                sys.stderr.write("[promptfoo_logger] failed to emit log\n")
                sys.stderr.flush()
            except Exception:
                pass

    def _log(
        self, level: str, message: str, data: Optional[Dict[str, Any]] = None
    ) -> None:
        """Output a structured log message."""
        log_entry = {
            "marker": LOG_MARKER,
            "version": LOG_PROTOCOL_VERSION,
            "level": level,
            "message": message,
        }
        if data is not None:
            log_entry["data"] = data

        try:
            log_json = json.dumps(log_entry)
        except (TypeError, ValueError):
            # Fallback for non-serializable data: use repr()
            log_entry["data"] = repr(data)
            try:
                log_json = json.dumps(log_entry)
            except Exception:
                # Final fallback: drop data entirely
                log_entry.pop("data", None)
                log_json = json.dumps(log_entry)

        self._emit(log_json)

    def debug(self, message: str, data: Optional[Dict[str, Any]] = None) -> None:
        """Log a debug message. Only shown when LOG_LEVEL=debug."""
        self._log("debug", message, data)

    def info(self, message: str, data: Optional[Dict[str, Any]] = None) -> None:
        """Log an info message."""
        self._log("info", message, data)

    def warn(self, message: str, data: Optional[Dict[str, Any]] = None) -> None:
        """Log a warning message."""
        self._log("warn", message, data)

    def error(self, message: str, data: Optional[Dict[str, Any]] = None) -> None:
        """Log an error message."""
        self._log("error", message, data)


# Singleton logger instance
logger = PromptfooLogger()


# ============================================================================
# Context injection / stripping utilities
# ============================================================================

# Marker key set by the TypeScript side to signal that this dict arg is a hook
# context and should receive the Python logger. Only dicts with this key get
# logger injection; all other dict args are left untouched.
_INJECT_LOGGER_MARKER = "__inject_logger__"

# Keys that are injected at runtime and must be stripped before JSON serialization.
_RUNTIME_KEYS = {"logger", _INJECT_LOGGER_MARKER}


def inject_logger_into_context(args: List[Any]) -> List[Any]:
    """Inject the Python logger into dict args that carry the __inject_logger__ marker.

    Only dicts containing ``__inject_logger__: true`` (set by the TS-side hook
    runner) receive the logger.  The marker itself is stripped so user code never
    sees it.  All other args are passed through unchanged.
    """
    result = []
    for arg in args:
        if isinstance(arg, dict) and arg.get(_INJECT_LOGGER_MARKER):
            new_arg = {k: v for k, v in arg.items() if k != _INJECT_LOGGER_MARKER}
            new_arg["logger"] = logger
            result.append(new_arg)
        else:
            result.append(arg)
    return result


def inject_logger_into_provider_context(args: List[Any]) -> List[Any]:
    """Inject the logger into only the context arg of a provider call.

    Provider call signatures:
      call_api(prompt, options, context)   -- 3 args, context is last
      call_embedding_api(prompt, options)  -- 2 args, no context
      call_classification_api(prompt, options) -- 2 args, no context

    Only injects into the last arg when there are 3+ args and it is a dict,
    avoiding injection into the options dict which may be passed to SDK calls.
    """
    if len(args) >= 3 and isinstance(args[-1], dict):
        args = list(args)
        args[-1] = {**args[-1], "logger": logger}
    return args


def strip_logger_from_result(result: Any) -> Any:
    """Remove the logger (and marker) from result before JSON serialization.

    Only strips keys that we inject at runtime (logger, __inject_logger__).
    Does NOT strip arbitrary user keys like 'filters' or 'originalProvider'.
    """
    if isinstance(result, dict):
        return {
            k: strip_logger_from_result(v)
            for k, v in result.items()
            if k not in _RUNTIME_KEYS
        }
    elif isinstance(result, list):
        return [strip_logger_from_result(item) for item in result]
    return result
