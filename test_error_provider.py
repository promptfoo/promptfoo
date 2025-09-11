#!/usr/bin/env python3
"""
Test 4: Runtime Error Handling
Tests that runtime errors don't crash the persistent process
"""

def call_api(prompt, options=None, context=None, state=None):
    """Function that can succeed or fail based on prompt"""
    print(f"Processing prompt: '{prompt}'")
    
    if prompt.lower() == "error":
        print("About to raise an error!")
        raise ValueError("Intentional test error - this should not crash the process")
    
    if prompt.lower() == "fine":
        print("Returning successful response")
        return {
            "output": "Everything is working fine!",
            "status": "success"
        }
    
    # Default response
    return {
        "output": f"Processed: {prompt}",
        "status": "default"
    }