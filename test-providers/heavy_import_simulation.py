import time
import json

# Simulate heavy import with a module-level expensive operation
print("HEAVY IMPORT: Loading expensive dependencies...", flush=True)
start_time = time.time()
time.sleep(0.3)  # Simulate 300ms import time
load_time = time.time()
print(f"HEAVY IMPORT: Loaded in {load_time - start_time:.2f}s", flush=True)

# Module-level state
call_counter = 0
MODULE_LOAD_TIME = load_time

def call_api(prompt, options, context):
    global call_counter
    call_counter += 1
    
    return {
        "output": f"Response to: {prompt}",
        "metadata": {
            "call_number": call_counter,
            "module_loaded_at": MODULE_LOAD_TIME,
            "import_simulation": "300ms sleep completed once"
        }
    }
