"""
Python extension hook for smoke testing logger support.
Tests both context['logger'] injection and direct import.
"""


def beforeAll(context, hook_info=None):
    """Hook that logs via context logger and direct import."""
    ctx_logger = context.get("logger")
    if ctx_logger is None:
        raise RuntimeError("context['logger'] is None - logger injection failed")

    ctx_logger.info("py-beforeAll-context-logger", {"source": "context"})
    ctx_logger.debug("py-beforeAll-debug-msg")
    ctx_logger.warn("py-beforeAll-warn-msg")

    # Also test direct import
    from promptfoo_logger import logger

    logger.info("py-beforeAll-direct-import")

    return context


def afterAll(context, hook_info=None):
    """Hook that logs eval summary."""
    ctx_logger = context.get("logger")
    if ctx_logger is None:
        raise RuntimeError("context['logger'] is None - logger injection failed")

    result_count = len(context.get("results", []))
    ctx_logger.info("py-afterAll-complete", {"resultCount": result_count})

    return context


def beforeEach(context, hook_info=None):
    """Hook that logs test details."""
    ctx_logger = context.get("logger")
    if ctx_logger is None:
        raise RuntimeError("context['logger'] is None - logger injection failed")

    test_vars = list(context.get("test", {}).get("vars", {}).keys())
    ctx_logger.info("py-beforeEach-test", {"vars": test_vars})

    return context


def afterEach(context, hook_info=None):
    """Hook that logs test result."""
    ctx_logger = context.get("logger")
    if ctx_logger is None:
        raise RuntimeError("context['logger'] is None - logger injection failed")

    success = context.get("result", {}).get("success", False)
    ctx_logger.info("py-afterEach-result", {"success": success})

    return context
