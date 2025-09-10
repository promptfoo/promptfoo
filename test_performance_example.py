#!/usr/bin/env python3
"""
Simple Python provider for testing persistent mode performance.
This simulates a real-world scenario with:
1. Expensive import (simulated with sleep)
2. Model loading (simulated with sleep)
3. State accumulation across calls
"""

import time
import json
import sys

# Simulate expensive import/initialization (this happens once in persistent mode)
print("🐍 Initializing Python provider...", file=sys.stderr)
time.sleep(0.5)  # Simulate expensive import time

# Global state to simulate model loading (should persist in persistent mode)
_model_cache = {}

def load_expensive_model():
    """Simulate loading an expensive ML model"""
    print("🧠 Loading expensive model...", file=sys.stderr)
    time.sleep(1.0)  # Simulate model loading time
    return {"model_id": "test-model-v1", "loaded_at": time.time()}

def call_api(prompt, options=None, context=None, state=None):
    """
    Main API function with simulated ML workload.
    Tests both traditional and persistent mode behavior.
    """
    if options is None:
        options = {}
    if context is None:
        context = {}
    if state is None:
        state = {}
    
    start_time = time.time()
    
    # In traditional mode, this happens every call
    # In persistent mode, this happens once and is cached in state
    if 'model' not in state:
        if 'model' not in _model_cache:
            _model_cache['model'] = load_expensive_model()
        state['model'] = _model_cache['model']
    
    # Simulate some processing work
    time.sleep(0.1)
    
    # Track call count in state (demonstrates state persistence)
    state['call_count'] = state.get('call_count', 0) + 1
    
    # Simulate result processing
    processing_time = time.time() - start_time
    
    result = {
        "output": {
            "prompt": prompt,
            "response": f"Processed '{prompt}' using {state['model']['model_id']}",
            "call_number": state['call_count'],
            "processing_time_ms": round(processing_time * 1000, 2),
            "model_loaded_at": state['model']['loaded_at'],
            "persistent_state": bool(state.get('call_count', 0) > 1)
        }
    }
    
    return result

if __name__ == "__main__":
    # Test the provider standalone
    print("Testing provider locally...")
    result1 = call_api("test prompt 1")
    print("Result 1:", json.dumps(result1, indent=2))
    
    result2 = call_api("test prompt 2")
    print("Result 2:", json.dumps(result2, indent=2))