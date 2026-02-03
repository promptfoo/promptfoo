"""
Shared context utilities for Promptfoo Python wrappers.

Provides logger injection and result sanitization used by both
wrapper.py (one-shot scripts) and persistent_wrapper.py (long-lived workers).
"""

from promptfoo_logger import logger

# Marker key set by the TypeScript side to signal that this dict arg is a hook
# context and should receive the Python logger. Only dicts with this key get
# logger injection; all other dict args are left untouched.
_INJECT_LOGGER_MARKER = "__inject_logger__"

# Keys that are injected at runtime and must be stripped before JSON serialization.
_RUNTIME_KEYS = {"logger", _INJECT_LOGGER_MARKER}


def inject_logger_into_context(args):
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


def inject_logger_into_provider_context(args):
    """Inject the logger into only the context arg of a provider call.

    Provider call signatures:
      call_api(prompt, options, context)   — 3 args, context is last
      call_embedding_api(prompt, options)  — 2 args, no context
      call_classification_api(prompt, options) — 2 args, no context

    Only injects into the last arg when there are 3+ args and it is a dict,
    avoiding injection into the options dict which may be passed to SDK calls.
    """
    if len(args) >= 3 and isinstance(args[-1], dict):
        args = list(args)
        args[-1] = {**args[-1], "logger": logger}
    return args


def strip_logger_from_result(result):
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
