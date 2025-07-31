# Test Python provider errors

# Test missing required parameter
def call_api(prompt):  # Missing options and context parameters
    return {"output": "test"}

# Test invalid return value
def call_api_invalid(prompt, options, context):
    return "invalid"  # Should return dict with 'output' key

# Test missing module
def call_api_module_error(prompt, options, context):
    import pandas as pd  # Module not installed
    return {"output": "test"}