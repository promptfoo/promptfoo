# Test Python transform errors

# Test missing parameter
def get_transform(output):  # Missing context parameter
    return output.upper()

# Test invalid function - uncomment to test
# def get_transform_invalid(output, context):
#     import tensorflow as tf  # Missing module
#     return output.upper()