# State Persistence Test
# Verifies that module-level state persists across calls

call_count = 0

def call_api(prompt, options, context):
    global call_count
    call_count += 1
    return {
        "output": f"Call #{call_count}",
        "count": call_count
    }
