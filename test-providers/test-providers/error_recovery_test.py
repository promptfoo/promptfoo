# Error Recovery Test
# Verifies that workers survive Python exceptions

def call_api(prompt, options, context):
    if "error" in prompt.lower():
        raise ValueError("Intentional test error")
    return {"output": f"Success: {prompt}"}
