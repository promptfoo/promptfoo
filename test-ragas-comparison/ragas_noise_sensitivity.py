"""
Test script to run RAGAS noise sensitivity metric for comparison with promptfoo
"""

import asyncio
from typing import List
from ragas.metrics import NoiseSensitivity
from ragas.dataset_schema import SingleTurnSample
from datasets import Dataset

# Initialize the metric
noise_sensitivity_relevant = NoiseSensitivity(mode="relevant")
noise_sensitivity_irrelevant = NoiseSensitivity(mode="irrelevant")

async def test_noise_sensitivity():
    """Test noise sensitivity with the same data we'll use in promptfoo"""
    
    # Test Case 1: Simple case with some incorrect information
    test_cases = [
        {
            "user_input": "What is the capital of France?",
            "response": "The capital of France is Paris. Berlin is the capital of Germany.",
            "reference": "The capital of France is Paris.",
            "retrieved_contexts": [
                "Paris is the capital of France.",
                "Berlin is the capital of Germany."
            ],
            "context_relevance": [True, False]  # Second context is irrelevant to the question
        },
        {
            "user_input": "What programming language is best for machine learning?",
            "response": "Python is widely used for machine learning. It has libraries like TensorFlow and PyTorch. JavaScript is used for web development.",
            "reference": "Python is widely used for machine learning due to its extensive libraries like TensorFlow, PyTorch, and scikit-learn.",
            "retrieved_contexts": [
                "Python is the most popular language for machine learning with libraries like TensorFlow and PyTorch.",
                "JavaScript is primarily used for web development and frontend programming.",
                "Java is used for enterprise applications."
            ],
            "context_relevance": [True, False, False]
        }
    ]
    
    print("Running RAGAS Noise Sensitivity Tests\n")
    print("=" * 80)
    
    for i, test in enumerate(test_cases):
        print(f"\nTest Case {i+1}:")
        print(f"Question: {test['user_input']}")
        print(f"Response: {test['response']}")
        print(f"Reference: {test['reference']}")
        print(f"Contexts: {test['retrieved_contexts']}")
        print(f"Relevance: {test['context_relevance']}")
        
        # Create sample for RAGAS
        sample = SingleTurnSample(
            user_input=test["user_input"],
            response=test["response"],
            reference=test["reference"],
            retrieved_contexts=test["retrieved_contexts"]
        )
        
        # For relevant mode - we need to mark all contexts as relevant
        sample_relevant = SingleTurnSample(
            user_input=test["user_input"],
            response=test["response"],
            reference=test["reference"],
            retrieved_contexts=test["retrieved_contexts"]
        )
        
        # Create datasets
        dataset_relevant = Dataset.from_list([{
            "user_input": sample_relevant.user_input,
            "response": sample_relevant.response,
            "reference": sample_relevant.reference,
            "retrieved_contexts": sample_relevant.retrieved_contexts
        }])
        
        # For irrelevant mode, we need to pass context relevance
        dataset_irrelevant = Dataset.from_list([{
            "user_input": sample.user_input,
            "response": sample.response,
            "reference": sample.reference,
            "retrieved_contexts": sample.retrieved_contexts,
            "context_relevance": test["context_relevance"]
        }])
        
        # Calculate scores
        print("\nCalculating RAGAS scores...")
        
        # Relevant mode
        result_relevant = await noise_sensitivity_relevant.score(dataset_relevant)
        print(f"RAGAS Relevant Mode Score: {result_relevant}")
        
        # Irrelevant mode (if we have context relevance labels)
        if "context_relevance" in test:
            result_irrelevant = await noise_sensitivity_irrelevant.score(dataset_irrelevant)
            print(f"RAGAS Irrelevant Mode Score: {result_irrelevant}")
        
        print("-" * 80)

if __name__ == "__main__":
    # Run the async function
    asyncio.run(test_noise_sensitivity())