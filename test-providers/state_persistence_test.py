# State Persistence Test
# Verifies that global state persists across multiple calls

counter = 0

def call_api(prompt, options, context):
    global counter
    counter += 1
    return {
        "output": f"Call #{counter}",
        "count": counter
    }
