"""
Mock LLM Provider for Performance Testing

This provider simulates realistic LLM behavior with:
- Variable latency based on content length and model type
- Token usage tracking (input, output, total)
- Cost calculation based on token pricing
- Configurable error rates and failure modes
- Support for different "model" configurations

Usage in promptfooconfig.yaml:
  providers:
    - id: file://mock_provider.py
      label: 'Fast Model'
      config:
        model: 'fast-v1'
        latency_base_ms: 50
        latency_per_token_ms: 0.5
        cost_per_1k_input: 0.0001
        cost_per_1k_output: 0.0002
        error_rate: 0.01
"""

import hashlib
import random
import time
from typing import Any

# Model presets for different performance characteristics
MODEL_PRESETS = {
    "fast-v1": {
        "latency_base_ms": 30,
        "latency_per_token_ms": 0.3,
        "cost_per_1k_input": 0.00005,
        "cost_per_1k_output": 0.00015,
        "output_multiplier": 0.8,  # Ratio of output to input tokens
    },
    "fast-v2": {
        "latency_base_ms": 25,
        "latency_per_token_ms": 0.25,
        "cost_per_1k_input": 0.00008,
        "cost_per_1k_output": 0.00024,
        "output_multiplier": 1.0,
    },
    "balanced-v1": {
        "latency_base_ms": 100,
        "latency_per_token_ms": 1.0,
        "cost_per_1k_input": 0.0003,
        "cost_per_1k_output": 0.0006,
        "output_multiplier": 1.2,
    },
    "balanced-v2": {
        "latency_base_ms": 80,
        "latency_per_token_ms": 0.8,
        "cost_per_1k_input": 0.0005,
        "cost_per_1k_output": 0.001,
        "output_multiplier": 1.5,
    },
    "quality-v1": {
        "latency_base_ms": 200,
        "latency_per_token_ms": 2.0,
        "cost_per_1k_input": 0.001,
        "cost_per_1k_output": 0.003,
        "output_multiplier": 2.0,
    },
    "quality-v2": {
        "latency_base_ms": 250,
        "latency_per_token_ms": 2.5,
        "cost_per_1k_input": 0.002,
        "cost_per_1k_output": 0.006,
        "output_multiplier": 2.5,
    },
    "premium-v1": {
        "latency_base_ms": 300,
        "latency_per_token_ms": 3.0,
        "cost_per_1k_input": 0.003,
        "cost_per_1k_output": 0.015,
        "output_multiplier": 3.0,
    },
    "premium-v2": {
        "latency_base_ms": 350,
        "latency_per_token_ms": 4.0,
        "cost_per_1k_input": 0.005,
        "cost_per_1k_output": 0.025,
        "output_multiplier": 3.5,
    },
}


def estimate_tokens(text: str) -> int:
    """Estimate token count (roughly 4 chars per token for English)."""
    return max(1, len(text) // 4)


def generate_deterministic_output(prompt: str, model: str, seed: int = 42) -> str:
    """
    Generate a deterministic output based on input.
    Uses hash for reproducibility while varying output length.
    """
    # Create a hash-based seed for this specific input
    hash_input = f"{prompt}:{model}:{seed}"
    hash_val = int(hashlib.md5(hash_input.encode()).hexdigest(), 16)
    random.seed(hash_val)

    # Generate response based on input characteristics
    words = [
        "The",
        "response",
        "indicates",
        "that",
        "processing",
        "was",
        "successful",
        "with",
        "model",
        "analysis",
        "complete",
        "results",
        "show",
        "positive",
        "outcomes",
        "further",
        "evaluation",
        "suggests",
        "optimal",
        "performance",
        "metrics",
        "demonstrate",
        "expected",
        "behavior",
        "patterns",
        "data",
        "transformation",
        "yielded",
        "accurate",
        "predictions",
    ]

    # Vary output length based on model type
    preset = MODEL_PRESETS.get(model, MODEL_PRESETS["balanced-v1"])
    multiplier = preset["output_multiplier"]

    input_words = len(prompt.split())
    output_words = int(input_words * multiplier * random.uniform(0.8, 1.2))
    output_words = max(5, min(output_words, 200))  # Clamp between 5-200 words

    output_text = " ".join(random.choices(words, k=output_words))

    # Reset random seed to avoid affecting other operations
    random.seed()

    return output_text


def call_api(prompt: str, options: dict, context: dict) -> dict[str, Any]:
    """
    Mock LLM provider that simulates realistic API behavior.

    Returns:
        dict with output, tokenUsage, cost, and optional error
    """
    config = options.get("config", {})

    # Get model preset or use custom config
    model = config.get("model", "balanced-v1")
    preset = MODEL_PRESETS.get(model, {})

    # Merge preset with custom config (custom overrides preset)
    settings = {**preset, **config}

    # Extract settings
    latency_base_ms = settings.get("latency_base_ms", 100)
    latency_per_token_ms = settings.get("latency_per_token_ms", 1.0)
    cost_per_1k_input = settings.get("cost_per_1k_input", 0.0003)
    cost_per_1k_output = settings.get("cost_per_1k_output", 0.0006)
    error_rate = settings.get("error_rate", 0.0)
    seed = settings.get("seed", 42)

    # Simulate random errors if configured
    if error_rate > 0 and random.random() < error_rate:
        error_types = [
            "Rate limit exceeded. Please retry after 60 seconds.",
            "Internal server error. Request failed.",
            "Connection timeout. Service temporarily unavailable.",
            "Invalid request format. Check input parameters.",
        ]
        return {
            "output": "",
            "error": random.choice(error_types),
            "tokenUsage": {"total": 0, "prompt": 0, "completion": 0},
            "cost": 0,
        }

    # Calculate token counts
    input_tokens = estimate_tokens(prompt)

    # Generate output
    output_text = generate_deterministic_output(prompt, model, seed)
    output_tokens = estimate_tokens(output_text)
    total_tokens = input_tokens + output_tokens

    # Calculate cost
    input_cost = (input_tokens / 1000) * cost_per_1k_input
    output_cost = (output_tokens / 1000) * cost_per_1k_output
    total_cost = input_cost + output_cost

    # Simulate latency
    base_latency = latency_base_ms / 1000
    token_latency = (total_tokens * latency_per_token_ms) / 1000
    total_latency = base_latency + token_latency

    # Add some variance (±20%)
    total_latency *= random.uniform(0.8, 1.2)

    # Sleep to simulate API call time
    time.sleep(total_latency)

    return {
        "output": output_text,
        "tokenUsage": {
            "total": total_tokens,
            "prompt": input_tokens,
            "completion": output_tokens,
        },
        "cost": total_cost,
        "cached": False,
        "metadata": {
            "model": model,
            "latency_ms": int(total_latency * 1000),
        },
    }


if __name__ == "__main__":
    # Test the provider

    test_prompt = "What is the capital of France? Please explain in detail."

    for model_name in ["fast-v1", "balanced-v1", "quality-v1", "premium-v1"]:
        result = call_api(
            test_prompt,
            {"config": {"model": model_name}},
            {"vars": {}},
        )
        print(f"\n{model_name}:")
        print(f"  Output: {result['output'][:50]}...")
        print(f"  Tokens: {result['tokenUsage']}")
        print(f"  Cost: ${result['cost']:.6f}")
