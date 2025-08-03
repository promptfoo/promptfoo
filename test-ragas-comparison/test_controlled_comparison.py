#!/usr/bin/env python3
"""
Controlled test comparing RAGAS with promptfoo using identical inputs
"""

import os
import json
import asyncio
from typing import Dict, List
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from ragas.metrics import ContextRecall, ContextRelevance, AnswerRelevancy, Faithfulness
from ragas import SingleTurnSample
import numpy as np

# Check API key
api_key = os.environ.get("OPENAI_API_KEY")
if not api_key:
    print("ERROR: Please set OPENAI_API_KEY environment variable")
    exit(1)

# Configure LLM with exact settings
llm = ChatOpenAI(
    model="gpt-4o",
    temperature=0,
    api_key=api_key,
    max_tokens=1000,  # Limit to control verbosity
    seed=42
)

embeddings = OpenAIEmbeddings(
    model="text-embedding-ada-002",
    api_key=api_key
)

# Initialize metrics
metrics = {
    "context_recall": ContextRecall(llm=llm),
    "context_relevance": ContextRelevance(llm=llm),
    "answer_relevancy": AnswerRelevancy(llm=llm, embeddings=embeddings),
    "faithfulness": Faithfulness(llm=llm)
}

# Simple test case
test_case = {
    "user_input": "What is the capital of France?",
    "retrieved_contexts": ["Paris is the capital of France."],
    "response": "The capital of France is Paris.",
    "reference": "Paris is the capital of France."
}

async def run_single_metric_test():
    """Run a single metric test to see exact behavior"""
    
    print("Running Controlled RAGAS Test")
    print("=" * 80)
    print(f"Model: {llm.model_name}")
    print(f"Temperature: {llm.temperature}")
    print(f"Seed: 42")
    print("=" * 80)
    
    # Create sample
    sample = SingleTurnSample(
        user_input=test_case["user_input"],
        retrieved_contexts=test_case["retrieved_contexts"],
        response=test_case["response"],
        reference=test_case["reference"]
    )
    
    results = {}
    
    # Test each metric individually
    for metric_name, metric in metrics.items():
        print(f"\nTesting {metric_name}...")
        try:
            # Run metric
            result = await metric.single_turn_ascore(sample)
            results[metric_name] = float(result)
            print(f"  Score: {result:.4f}")
            
            # Try to get additional details if available
            if hasattr(metric, '_reproducibility'):
                print(f"  Reproducibility: {metric._reproducibility}")
                
        except Exception as e:
            print(f"  Error: {e}")
            results[metric_name] = None
    
    # Save results
    with open("ragas_controlled_results.json", "w") as f:
        json.dump({
            "test_case": test_case,
            "results": results,
            "llm_config": {
                "model": llm.model_name,
                "temperature": llm.temperature,
                "seed": 42
            }
        }, f, indent=2)
    
    print("\nResults saved to ragas_controlled_results.json")
    return results

# Run the test
if __name__ == "__main__":
    results = asyncio.run(run_single_metric_test())
    
    print("\n\nExpected Scores:")
    print("-" * 40)
    print("Context Recall: 1.00 (ground truth matches context)")
    print("Context Relevance: 1.00 (context directly answers query)")
    print("Answer Relevancy: ~0.95+ (answer directly addresses question)")
    print("Faithfulness: 1.00 (answer claim supported by context)")
    
    print("\n\nActual RAGAS Scores:")
    print("-" * 40)
    for metric, score in results.items():
        if score is not None:
            print(f"{metric}: {score:.4f}")
        else:
            print(f"{metric}: ERROR")