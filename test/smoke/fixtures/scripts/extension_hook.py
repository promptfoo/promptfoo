def extension_hook(hook_name, context):
    # Returning the context unchanged exercises the JSON round-trip that
    # previously dropped non-serializable prompt functions (issue #9653).
    return context
