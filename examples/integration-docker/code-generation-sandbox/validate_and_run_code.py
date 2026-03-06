import re

import epicbox

# Replace with your preferred Docker image
DOCKER_IMAGE = "python:3.9-alpine"


def get_assert(output, context):
    # Extract the Python function from the LLM output
    function_match = re.search(r"```python\s*\n(def\s+.*?)\n```", output, re.DOTALL)
    if not function_match:
        return {"pass": False, "score": 0, "reason": "No function definition found"}

    function_code = function_match.group(1)

    # Configure epicbox
    epicbox.configure(profiles=[epicbox.Profile("python", DOCKER_IMAGE)])

    # Get the function name, test input, and expected output from the context
    function_name = context["vars"]["function_name"]
    test_input = context["vars"]["test_input"]
    expected_output = context["vars"]["expected_output"]

    # Prepare the code to run in the sandbox
    test_code = f"""
{function_code}

# Test the function
result = {function_name}({test_input})
print(result)
"""

    files = [{"name": "main.py", "content": test_code.encode("utf-8")}]
    limits = {"cputime": 1, "memory": 64}

    # Run the code in the sandbox
    result = epicbox.run("python", "python main.py", files=files, limits=limits)

    if result["exit_code"] != 0:
        return {
            "pass": False,
            "score": 0,
            "reason": f"Execution error: {result['stderr'].decode('utf-8')}",
        }

    # Compare the output with the expected result
    actual_output = result["stdout"].decode("utf-8").strip()
    if actual_output == str(expected_output):
        return {
            "pass": True,
            "score": 1,
            "reason": f"Correct output: got {expected_output}",
        }
    else:
        return {
            "pass": False,
            "score": 0,
            "reason": f"Incorrect output. Expected: {expected_output}, Got: {actual_output}",
        }
