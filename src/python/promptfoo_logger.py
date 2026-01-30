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
from typing import Any, Optional

# Special marker that Node.js looks for to identify structured log messages
LOG_MARKER = "__PROMPTFOO_LOG__"


class PromptfooLogger:
    """
    A logger that outputs JSON-formatted messages for the Node.js wrapper to parse.

    Log messages are written to stderr to avoid interfering with the function's
    return value communication (which uses stdout via file).
    """

    def _log(self, level: str, message: str, data: Optional[dict[str, Any]] = None) -> None:
        """Output a structured log message."""
        log_entry = {
            "marker": LOG_MARKER,
            "level": level,
            "message": message,
        }
        if data is not None:
            log_entry["data"] = data

        # Write to stderr so it doesn't interfere with return values
        # The Node.js wrapper will parse this and route to the appropriate logger
        print(json.dumps(log_entry), file=sys.stderr)
        sys.stderr.flush()

    def debug(self, message: str, data: Optional[dict[str, Any]] = None) -> None:
        """Log a debug message. Only shown when LOG_LEVEL=debug."""
        self._log("debug", message, data)

    def info(self, message: str, data: Optional[dict[str, Any]] = None) -> None:
        """Log an info message."""
        self._log("info", message, data)

    def warn(self, message: str, data: Optional[dict[str, Any]] = None) -> None:
        """Log a warning message."""
        self._log("warn", message, data)

    def error(self, message: str, data: Optional[dict[str, Any]] = None) -> None:
        """Log an error message."""
        self._log("error", message, data)


# Singleton logger instance
logger = PromptfooLogger()
