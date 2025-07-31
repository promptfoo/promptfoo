# Test Python test loader errors

# Test missing parameter
def generate_tests():  # Should accept config parameter
    return [{"vars": {"test": "value"}}]

# Test invalid return value
def generate_tests_invalid(config):
    return "invalid"  # Should return list of test cases

# Test missing module
def generate_tests_module_error(config):
    import scipy  # Module not installed
    return [{"vars": {"test": "value"}}]