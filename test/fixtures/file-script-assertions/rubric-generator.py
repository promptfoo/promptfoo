# Test fixture for file-based script assertions
# Used to test that script output is correctly passed to assertion handlers


def rubric(_output, context):
    return f"Verify the response covers: {context['vars']['topic']}"


def expected_value(_output, _context):
    return "expected string"


# For deterministic testing - script returns a known value
def known_value(_output, _context):
    return "SCRIPT_OUTPUT_12345"


# Returns empty string
def empty_value(_output, _context):
    return ""


# Returns None (null equivalent)
def none_value(_output, _context):
    return None


# Dynamic pattern based on context
def get_pattern(_output, context):
    return context["vars"].get("pattern", r"\d+")


# For regression testing - python assertion that returns boolean
def grading_function(output, _context):
    return "expected" in output


# Returns a dict/object
def rubric_object(_output, _context):
    return {"role": "system", "content": "Evaluate the response for accuracy"}


# Returns a number
def numeric_value(_output, _context):
    return 42


# Returns a list for bleu/gleu
def reference_array(_output, _context):
    return ["reference one", "reference two"]
