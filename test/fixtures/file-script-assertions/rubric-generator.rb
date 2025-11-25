# Test fixture for file-based script assertions
# Used to test that script output is correctly passed to assertion handlers

def rubric(output, context)
  "Ensure the answer includes: #{context['vars']['topic']}"
end

def expected_value(output, context)
  "expected string"
end

# For deterministic testing - script returns a known value
def known_value(output, context)
  "SCRIPT_OUTPUT_12345"
end

# Returns empty string
def empty_value(output, context)
  ""
end

# Returns nil (null equivalent)
def nil_value(output, context)
  nil
end

# Dynamic pattern based on context
def get_pattern(output, context)
  context['vars']['pattern'] || '\d+'
end

# For regression testing - ruby assertion that returns boolean
def grading_function(output, context)
  output.include?("expected")
end

# Returns a hash/object
def rubric_object(output, context)
  {
    "role" => "system",
    "content" => "Evaluate the response for accuracy"
  }
end

# Returns a number
def numeric_value(output, context)
  42
end

# Returns an array for bleu/gleu
def reference_array(output, context)
  ["reference one", "reference two"]
end
