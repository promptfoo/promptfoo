# This fixture intentionally uses the legacy (hook_name, context) convention
# to verify backward compatibility with extension hooks created before the
# context-first API.
def extension_hook(hook_name, context):
    # Returning the context unchanged exercises the JSON round-trip that
    # previously dropped non-serializable prompt functions (issue #9653).
    return context
