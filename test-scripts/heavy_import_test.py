#!/usr/bin/env python3
"""
Heavy import test script to demonstrate persistent Python provider performance benefits
Simulates expensive imports and initialization typical in ML/data science workflows
"""

import time
import json
import random
from datetime import datetime

# Simulate heavy imports (these would be expensive in real scenarios)
print("Loading heavy imports...", file=__import__('sys').stderr)
start_time = time.time()

# Simulate importing heavy libraries
time.sleep(0.5)  # Simulate numpy import
print("Imported numpy simulation", file=__import__('sys').stderr)

time.sleep(0.3)  # Simulate pandas import
print("Imported pandas simulation", file=__import__('sys').stderr)

time.sleep(0.4)  # Simulate scikit-learn import
print("Imported scikit-learn simulation", file=__import__('sys').stderr)

time.sleep(0.2)  # Simulate other ML libraries
print("Imported other ML libraries simulation", file=__import__('sys').stderr)

import_time = time.time() - start_time
print(f"Import time: {import_time:.2f}s", file=__import__('sys').stderr)

# Global state - expensive to initialize, should be reused in persistent mode
class MockMLModel:
    def __init__(self):
        print("Initializing MockMLModel...", file=__import__('sys').stderr)
        time.sleep(0.3)  # Simulate model loading time
        self.weights = [random.random() for _ in range(1000)]
        self.bias = random.random()
        self.training_data_size = 10000
        self.initialized_at = datetime.now()
        print("MockMLModel initialized", file=__import__('sys').stderr)

    def predict(self, features):
        # Simulate model prediction
        if not isinstance(features, list):
            return {"error": "Features must be a list"}

        # Simple linear combination with noise
        prediction = sum(f * w for f, w in zip(features, self.weights[:len(features)]))
        prediction += self.bias
        prediction += random.gauss(0, 0.1)  # Add noise

        return {
            "prediction": round(prediction, 4),
            "confidence": random.uniform(0.7, 0.95),
            "model_initialized_at": self.initialized_at.isoformat()
        }

# Initialize model globally (expensive operation)
model = None
call_count = 0
total_processing_time = 0

def init_provider():
    """Initialize the provider - loads the heavy model"""
    global model
    init_start = time.time()
    model = MockMLModel()
    init_time = time.time() - init_start

    return {
        "status": "initialized",
        "import_time_seconds": import_time,
        "model_init_time_seconds": init_time,
        "total_init_time": import_time + init_time,
        "model_loaded": True
    }

def call_api(prompt, options=None, context=None):
    """Main API function that uses the expensive model"""
    global model, call_count, total_processing_time
    call_count += 1

    start_time = time.time()

    # Initialize model if not already done (traditional mode will do this every time)
    if model is None:
        init_result = init_provider()
        init_cost = init_result.get("total_init_time", 0)
    else:
        init_cost = 0

    if options is None:
        options = {}

    prompt_lower = prompt.lower()

    if "load ml model and predict" in prompt_lower:
        # Extract features from prompt
        import re
        features_match = re.search(r'\[([\d.,\s]+)\]', prompt)
        if features_match:
            try:
                features_str = features_match.group(1)
                features = [float(x.strip()) for x in features_str.split(',')]

                prediction_result = model.predict(features)
                processing_time = time.time() - start_time
                total_processing_time += processing_time

                return {
                    "output": prediction_result,
                    "features": features,
                    "call_count": call_count,
                    "processing_time_seconds": processing_time,
                    "initialization_cost_seconds": init_cost,
                    "average_processing_time": total_processing_time / call_count,
                    "model_reused": model is not None and init_cost == 0,
                    "persistent_mode_indicator": model.initialized_at.isoformat() if model else None
                }
            except ValueError as e:
                return {"error": f"Invalid features format: {e}"}
        else:
            return {"error": "No features found in prompt"}

    elif "process large dataset" in prompt_lower:
        # Extract dataset size
        import re
        size_match = re.search(r'(\d+)', prompt)
        size = int(size_match.group(1)) if size_match else 100

        # Simulate processing large dataset
        time.sleep(min(size / 1000, 2.0))  # Cap at 2 seconds for safety

        processed_items = []
        for i in range(min(size, 1000)):  # Cap at 1000 for performance
            item_result = model.predict([i, i*2, i*3])
            processed_items.append({
                "item_id": i,
                "prediction": item_result["prediction"]
            })

        processing_time = time.time() - start_time
        total_processing_time += processing_time

        return {
            "output": f"Processed {len(processed_items)} items",
            "sample_results": processed_items[:5],  # Return first 5 as sample
            "total_items": len(processed_items),
            "call_count": call_count,
            "processing_time_seconds": processing_time,
            "initialization_cost_seconds": init_cost,
            "average_processing_time": total_processing_time / call_count,
            "model_reused": init_cost == 0
        }

    elif "initialize complex state" in prompt_lower:
        # Test state initialization and computation
        complex_state = {
            "matrix": [[random.random() for _ in range(50)] for _ in range(50)],
            "computed_at": datetime.now().isoformat(),
            "call_count": call_count
        }

        # Simulate complex computation
        time.sleep(0.2)
        result = sum(sum(row) for row in complex_state["matrix"])

        processing_time = time.time() - start_time
        total_processing_time += processing_time

        return {
            "output": f"Complex computation result: {result:.4f}",
            "state_size": len(complex_state["matrix"]),
            "call_count": call_count,
            "processing_time_seconds": processing_time,
            "initialization_cost_seconds": init_cost,
            "model_reused": init_cost == 0
        }

    # Default case
    processing_time = time.time() - start_time
    return {
        "output": f"Processed: {prompt}",
        "call_count": call_count,
        "processing_time_seconds": processing_time,
        "initialization_cost_seconds": init_cost,
        "model_available": model is not None
    }

if __name__ == "__main__":
    # Direct test
    print("Testing heavy_import_test.py")
    print(json.dumps(call_api("Load ML model and predict: [1, 2, 3, 4, 5]"), indent=2))