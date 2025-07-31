# Test Python prompt errors

# Test missing parameter - this function name is the default
def get_prompts():  # Missing context parameter
    return ["Test prompt"]

# Test missing module - uncomment to test
# def get_prompts_module_error(context):
#     import keras  # Missing module
#     return ["Test prompt"]