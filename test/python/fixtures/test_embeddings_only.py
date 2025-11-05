"""
Test fixture for embeddings-only provider.
This file intentionally does NOT have call_api - only call_embedding_api.
This simulates the user's scenario from #6072.
"""


def call_embedding_api(prompt, options):
    """Only embedding functionality - no call_api defined."""
    # Simple embedding simulation
    words = prompt.lower().split()
    # Create a simple embedding based on word count and first letter
    embedding = [
        len(words) * 0.1,
        ord(words[0][0]) * 0.01 if words else 0.0,
        len(prompt) * 0.01,
    ]
    return {"embedding": embedding}
