#!/usr/bin/env python3
"""
Clean Python provider for testing persistent mode without stderr output.
"""

import time

# Global state to simulate model loading
_model_cache = {}

def load_expensive_model():
    """Simulate loading an expensive ML model"""
    time.sleep(1.0)  # Simulate model loading time
    return {"model_id": "test-model-v1", "loaded_at": time.time()}

def call_api(prompt, options=None, context=None, state=None):
    """
    Main API function with simulated ML workload.
    """
    if options is None:
        options = {}
    if context is None:
        context = {}
    if state is None:
        state = {}
    
    start_time = time.time()
    
    # Load model if not cached
    if 'model' not in state:
        if 'model' not in _model_cache:
            _model_cache['model'] = load_expensive_model()
        state['model'] = _model_cache['model']
    
    # Simulate some processing work
    time.sleep(0.1)
    
    # Track call count in state
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