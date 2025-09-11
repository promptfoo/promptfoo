#!/usr/bin/env python3
"""
Test 1: Stateful Persistence & Performance
Tests that the provider maintains state and provides performance boost
"""
import time
import uuid

class StatefulProvider:
    def __init__(self):
        print("StatefulProvider is initializing...")  # Should only appear once
        time.sleep(2)  # Simulate expensive initialization
        self.model_id = str(uuid.uuid4())  # Unique ID that should persist
        self.cache = {}
        
    def call_api(self, prompt, options=None, context=None, state=None):
        print(f"Processing prompt: {prompt}")  # Test logging
        
        # Use cache for performance
        if prompt in self.cache:
            print(f"Cache hit for: {prompt}")
            return {
                "output": self.cache[prompt],
                "model_id": self.model_id,
                "cached": True
            }
        
        # Simulate processing
        time.sleep(0.1)
        result = f"Processed: {prompt}"
        self.cache[prompt] = result
        
        print(f"Cache miss for: {prompt}")
        return {
            "output": result,
            "model_id": self.model_id,
            "cached": False
        }

# Global instance
provider = StatefulProvider()

def call_api(prompt, options=None, context=None, state=None):
    return provider.call_api(prompt, options, context, state)