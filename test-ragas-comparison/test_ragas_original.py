#!/usr/bin/env python3
"""
Test RAGAS original implementation with the same test cases as promptfoo
"""

import os
import json
from typing import List, Dict
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from ragas import evaluate
from ragas.metrics import (
    ContextRecall,
    ContextRelevance,
    AnswerRelevancy,
    Faithfulness
)
from datasets import Dataset
import pandas as pd

# Set OpenAI API key
api_key = os.environ.get("OPENAI_API_KEY")
if not api_key:
    print("ERROR: Please set OPENAI_API_KEY environment variable")
    print("Example: export OPENAI_API_KEY='your-api-key-here'")
    exit(1)

# Configure the exact same model and settings as promptfoo
llm = ChatOpenAI(
    model="gpt-4o",
    temperature=0,
    api_key=api_key,
    max_tokens=4096,  # Ensure consistent output length
    seed=42  # For reproducibility
)

embeddings = OpenAIEmbeddings(
    model="text-embedding-ada-002",
    api_key=api_key
)

# Initialize metrics with our LLM
context_recall = ContextRecall(llm=llm)
context_relevance = ContextRelevance(llm=llm)
answer_relevancy = AnswerRelevancy(llm=llm, embeddings=embeddings)
faithfulness = Faithfulness(llm=llm)

# Test data - same as promptfoo tests
test_data = [
    {
        "question": "What is the capital of France?",
        "contexts": ["France is a country in Western Europe. Paris is the capital and largest city of France, with a population of over 2 million people in the city proper."],
        "answer": "The capital of France is Paris.",
        "ground_truth": "Paris is the capital of France",
        "test_name": "Test 1: Basic Context Recall"
    },
    {
        "question": "What is the population of Tokyo?",
        "contexts": ["Tokyo is the capital of Japan. Mount Fuji is the highest mountain in Japan. Sushi is a popular Japanese dish."],
        "answer": "The context provided does not include information about the population of Tokyo. Therefore, I cannot provide an answer to that question based on the given context.",
        "ground_truth": "The population of Tokyo is approximately 14 million in the city proper.",
        "test_name": "Test 2: No Relevant Context"
    },
    {
        "question": "What are Einstein's major contributions?",
        "contexts": ["Albert Einstein was a German-born theoretical physicist. He developed the theory of relativity. He won the Nobel Prize in Physics in 1921. His formula E=mc² is very famous."],
        "answer": "Einstein's major contributions include the development of the theory of relativity, which transformed our understanding of space, time, and gravity. Additionally, he is well-known for his famous equation E=mc², which describes the equivalence of mass and energy.",
        "ground_truth": "Einstein developed the theory of relativity. He won the Nobel Prize for the photoelectric effect. He created the formula E=mc². He was born in Germany.",
        "test_name": "Test 3: Multiple Facts"
    }
]

def run_ragas_evaluation(data: List[Dict]) -> Dict:
    """Run RAGAS evaluation on the test data"""
    
    # Prepare data for RAGAS
    questions = [d["question"] for d in data]
    contexts = [d["contexts"] for d in data]
    answers = [d["answer"] for d in data]
    ground_truths = [d["ground_truth"] for d in data]
    
    # Create dataset
    dataset = Dataset.from_dict({
        "question": questions,
        "contexts": contexts,
        "answer": answers,
        "ground_truth": ground_truths
    })
    
    # Run evaluation
    print("Running RAGAS evaluation...")
    results = evaluate(
        dataset,
        metrics=[
            context_recall,
            context_relevance,
            answer_relevancy,
            faithfulness
        ]
    )
    
    return results

def main():
    """Main function to run tests and save results"""
    
    print("Testing RAGAS Original Implementation")
    print("=" * 50)
    print(f"Model: gpt-4o-mini")
    print(f"Temperature: 0")
    print(f"Embeddings: text-embedding-ada-002")
    print("=" * 50)
    
    # Run evaluation
    results = run_ragas_evaluation(test_data)
    
    # Print results
    print("\nOverall Scores:")
    print(f"Context Recall: {results['context_recall']:.4f}")
    print(f"Context Relevance: {results['context_relevance']:.4f}")
    print(f"Answer Relevancy: {results['answer_relevancy']:.4f}")
    print(f"Faithfulness: {results['faithfulness']:.4f}")
    
    # Get detailed results per sample
    df = results.to_pandas()
    
    print("\n\nDetailed Results per Test Case:")
    print("=" * 50)
    
    for i, test in enumerate(test_data):
        print(f"\n{test['test_name']}:")
        print(f"Question: {test['question']}")
        print(f"Context Recall: {df.iloc[i]['context_recall']:.4f}")
        print(f"Context Relevance: {df.iloc[i]['context_relevance']:.4f}")
        print(f"Answer Relevancy: {df.iloc[i]['answer_relevancy']:.4f}")
        print(f"Faithfulness: {df.iloc[i]['faithfulness']:.4f}")
    
    # Save results to JSON for comparison
    results_dict = {
        "overall_scores": {
            "context_recall": float(results['context_recall']),
            "context_relevance": float(results['context_relevance']),
            "answer_relevancy": float(results['answer_relevancy']),
            "faithfulness": float(results['faithfulness'])
        },
        "detailed_results": []
    }
    
    for i, test in enumerate(test_data):
        results_dict["detailed_results"].append({
            "test_name": test["test_name"],
            "question": test["question"],
            "scores": {
                "context_recall": float(df.iloc[i]['context_recall']),
                "context_relevance": float(df.iloc[i]['context_relevance']),
                "answer_relevancy": float(df.iloc[i]['answer_relevancy']),
                "faithfulness": float(df.iloc[i]['faithfulness'])
            }
        })
    
    with open("ragas_original_results.json", "w") as f:
        json.dump(results_dict, f, indent=2)
    
    print("\n\nResults saved to ragas_original_results.json")

if __name__ == "__main__":
    main()