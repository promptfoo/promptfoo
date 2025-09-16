#!/usr/bin/env python3
"""
Error handling test script for persistent Python provider validation
Tests error recovery, graceful degradation, and robustness
"""

import time
import json
import sys
from datetime import datetime

call_count = 0

def call_api(prompt, options=None, context=None):
    """Main API function that can trigger various errors"""
    global call_count
    call_count += 1

    if options is None:
        options = {}

    prompt_lower = prompt.lower()

    try:
        if "trigger_runtime_error" in prompt_lower:
            # Test runtime error handling
            if call_count % 2 == 1:
                # First call: trigger error
                raise RuntimeError(f"Simulated runtime error on call {call_count}")
            else:
                # Second call: should recover
                return {
                    "output": f"Recovered from previous error, call {call_count}",
                    "error_recovery": True,
                    "call_count": call_count
                }

        elif "trigger_import_error" in prompt_lower:
            # Test import error handling
            try:
                import nonexistent_module_12345
                return {"error": "This should not happen"}
            except ImportError as e:
                return {
                    "output": f"Handled import error gracefully: {str(e)}",
                    "error_type": "import_error",
                    "call_count": call_count,
                    "handled_gracefully": True
                }

        elif "trigger_timeout_simulation" in prompt_lower:
            # Simulate a timeout scenario
            timeout_duration = 2.0  # 2 seconds
            if "quick" in prompt_lower:
                timeout_duration = 0.1  # Quick timeout

            start_time = time.time()
            time.sleep(timeout_duration)
            elapsed = time.time() - start_time

            return {
                "output": f"Completed after {elapsed:.2f} seconds",
                "simulated_timeout": timeout_duration,
                "call_count": call_count,
                "timing_test": True
            }

        elif "trigger_memory_error_simulation" in prompt_lower:
            # Simulate memory pressure (controlled)
            try:
                # Create a moderately large list (not enough to crash)
                large_list = [i * i for i in range(100000)]  # ~400KB
                result = sum(large_list[:1000])  # Process only a subset

                return {
                    "output": f"Memory stress test completed: {result}",
                    "memory_test": True,
                    "list_size": len(large_list),
                    "call_count": call_count,
                    "memory_handled": True
                }
            except MemoryError as e:
                return {
                    "error": f"Memory error handled: {str(e)}",
                    "error_type": "memory_error",
                    "call_count": call_count,
                    "graceful_handling": True
                }

        elif "trigger_json_serialization_error" in prompt_lower:
            # Test JSON serialization edge cases
            class UnserializableObject:
                def __init__(self):
                    self.data = "test"

                def __repr__(self):
                    return f"UnserializableObject({self.data})"

            try:
                # This would normally cause JSON serialization issues
                problematic_data = {
                    "function": lambda x: x + 1,  # Functions are not JSON serializable
                    "object": UnserializableObject(),
                    "set": {1, 2, 3},  # Sets are not JSON serializable
                    "complex": complex(1, 2)  # Complex numbers are not JSON serializable
                }

                # Convert to serializable format
                safe_data = {
                    "function": "lambda x: x + 1",
                    "object": str(problematic_data["object"]),
                    "set": list(problematic_data["set"]),
                    "complex": {"real": problematic_data["complex"].real, "imag": problematic_data["complex"].imag}
                }

                return {
                    "output": "JSON serialization edge case handled",
                    "safe_data": safe_data,
                    "call_count": call_count,
                    "serialization_safe": True
                }

            except Exception as e:
                return {
                    "error": f"Serialization error: {str(e)}",
                    "error_type": "serialization_error",
                    "call_count": call_count
                }

        elif "test_no_args_function" in prompt_lower:
            # Test function with no arguments
            return no_args_function()

        elif "test_kwargs_function" in prompt_lower:
            # Test function with **kwargs
            return kwargs_function(test_param="value", call_count=call_count)

        elif "test_mixed_args_function" in prompt_lower:
            # Test function with mixed arguments
            return mixed_args_function("test", optional_param="optional", call_count=call_count)

        else:
            # Default case
            return {
                "output": f"Error test processed: {prompt}",
                "call_count": call_count,
                "no_errors": True
            }

    except Exception as e:
        # Catch-all error handler
        import traceback
        return {
            "error": str(e),
            "error_type": type(e).__name__,
            "traceback": traceback.format_exc(),
            "call_count": call_count,
            "handled_by_catch_all": True
        }

def no_args_function():
    """Test function with no arguments"""
    return {
        "output": "No args function called successfully",
        "function_type": "no_args",
        "success": True
    }

def kwargs_function(**kwargs):
    """Test function with **kwargs"""
    return {
        "output": "Kwargs function called successfully",
        "function_type": "kwargs",
        "received_kwargs": kwargs,
        "success": True
    }

def mixed_args_function(required_arg, optional_param="default", **kwargs):
    """Test function with mixed arguments"""
    return {
        "output": f"Mixed args function called with: {required_arg}",
        "function_type": "mixed_args",
        "required_arg": required_arg,
        "optional_param": optional_param,
        "additional_kwargs": kwargs,
        "success": True
    }

# Test class with error scenarios
class ErrorProneClass:
    def __init__(self):
        self.call_count = 0

    def call_api(self, prompt, options=None, context=None):
        self.call_count += 1

        if "class_error" in prompt.lower():
            raise ValueError(f"Class method error on call {self.call_count}")

        return {
            "output": f"Class method called: {prompt}",
            "class_call_count": self.call_count,
            "class_based": True
        }

if __name__ == "__main__":
    # Direct test
    print("Testing error_test.py")
    print(json.dumps(call_api("trigger_runtime_error"), indent=2))
    print(json.dumps(call_api("trigger_runtime_error"), indent=2))  # Should recover
    print(json.dumps(call_api("trigger_import_error"), indent=2))