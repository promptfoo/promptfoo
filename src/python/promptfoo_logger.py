"""
Promptfoo Logger for Python hooks.

This module provides a logger that outputs structured JSON messages
which are parsed by the Node.js wrapper and routed to the appropriate
log level in promptfoo's logging system.

Usage:
    from promptfoo_logger import logger

    logger.info("Test started", {"testId": "123"})
    logger.debug("Debug info")
    logger.warn("Something unexpected")
    logger.error("An error occurred", {"error": str(e)})
"""

import json
import sys
from typing import Any, Dict, Optional

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
