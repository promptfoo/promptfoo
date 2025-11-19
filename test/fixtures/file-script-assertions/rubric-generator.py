# Test fixture for file-based script assertions
# Used to test that script output is correctly passed to assertion handlers

def rubric(output, context):
    return f"Verify the response covers: {context['vars']['topic']}"

def expected_value(output, context):
    return "expected string"

# For deterministic testing - script returns a known value
def known_value(output, context):
    return "SCRIPT_OUTPUT_12345"

# Returns empty string
def empty_value(output, context):
    return ""

# Returns None (null equivalent)
def none_value(output, context):
    return None

# Dynamic pattern based on context
def get_pattern(output, context):
    return context['vars'].get('pattern', r'\d+')

# For regression testing - python assertion that returns boolean
def grading_function(output, context):
    return "expected" in output

# Returns a dict/object
def rubric_object(output, context):
    return {
        "role": "system",
        "content": "Evaluate the response for accuracy"
    }

# Returns a number
def numeric_value(output, context):
    return 42

# Returns a list for bleu/gleu
def reference_array(output, context):
    return ["reference one", "reference two"]
