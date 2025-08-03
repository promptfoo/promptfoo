#!/usr/bin/env python3
"""
Compare RAGAS original implementation with promptfoo implementation
This script shows the expected behavior of both implementations
"""

import json

# Expected test data
test_cases = [
    {
        "name": "Test 1: Basic Context Recall",
        "question": "What is the capital of France?",
        "context": "France is a country in Western Europe. Paris is the capital and largest city of France, with a population of over 2 million people in the city proper.",
        "answer": "The capital of France is Paris.",
        "ground_truth": "Paris is the capital of France"
    },
    {
        "name": "Test 2: No Relevant Context",
        "question": "What is the population of Tokyo?",
        "context": "Tokyo is the capital of Japan. Mount Fuji is the highest mountain in Japan. Sushi is a popular Japanese dish.",
        "answer": "The context provided does not include information about the population of Tokyo. Therefore, I cannot provide an answer to that question based on the given context.",
        "ground_truth": "The population of Tokyo is approximately 14 million in the city proper."
    },
    {
        "name": "Test 3: Multiple Facts",
        "question": "What are Einstein's major contributions?",
        "context": "Albert Einstein was a German-born theoretical physicist. He developed the theory of relativity. He won the Nobel Prize in Physics in 1921. His formula E=mc² is very famous.",
        "answer": "Einstein's major contributions include the development of the theory of relativity, which transformed our understanding of space, time, and gravity. Additionally, he is well-known for his famous equation E=mc², which describes the equivalence of mass and energy.",
        "ground_truth": "Einstein developed the theory of relativity. He won the Nobel Prize for the photoelectric effect. He created the formula E=mc². He was born in Germany."
    }
]

def analyze_metrics():
    """Analyze how each metric should work"""
    
    print("RAGAS Metrics Expected Behavior")
    print("=" * 80)
    
    for test in test_cases:
        print(f"\n{test['name']}:")
        print(f"Question: {test['question']}")
        print(f"Context sentences: {len(test['context'].split('. '))}")
        print(f"Ground truth sentences: {len(test['ground_truth'].split('. '))}")
        
        # Context Recall
        print("\nContext Recall (Ground Truth Attribution to Context):")
        gt_sentences = test['ground_truth'].split('. ')
        for i, sent in enumerate(gt_sentences):
            print(f"  {i+1}. {sent}")
        print("  → Measures: How many ground truth sentences can be attributed to context")
        
        # Context Relevance  
        print("\nContext Relevance (Relevant Context Sentences):")
        ctx_sentences = test['context'].split('. ')
        for i, sent in enumerate(ctx_sentences):
            print(f"  {i+1}. {sent}")
        print("  → Measures: How many context sentences are relevant to the question")
        
        # Answer Relevancy
        print("\nAnswer Relevancy:")
        print(f"  Answer: {test['answer'][:100]}...")
        print("  → Measures: Generates questions from answer, checks similarity to original question")
        
        # Faithfulness
        print("\nFaithfulness (Answer Claims Supported by Context):")
        print(f"  Answer: {test['answer'][:100]}...")
        print("  → Measures: How many claims in the answer are supported by context")
        
    print("\n\nExpected Score Calculations:")
    print("=" * 80)
    
    # Test 1
    print("\nTest 1 - Basic Context Recall:")
    print("- Context Recall: 1/1 = 1.00 (ground truth: 'Paris is capital' found in context)")
    print("- Context Relevance: 1/2 = 0.50 (only 'Paris is capital' sentence relevant)")
    print("- Answer Relevancy: ~0.90+ (answer directly addresses the question)")
    print("- Faithfulness: 1.00 (answer claim 'Paris is capital' supported by context)")
    
    # Test 2
    print("\nTest 2 - No Relevant Context:")
    print("- Context Recall: 0/1 = 0.00 (ground truth about population not in context)")
    print("- Context Relevance: 0/3 = 0.00 (no sentences about Tokyo population)")
    print("- Answer Relevancy: ~0.70+ (answer explains why it can't answer)")
    print("- Faithfulness: 1.00 (answer correctly states no info in context)")
    
    # Test 3
    print("\nTest 3 - Multiple Facts:")
    print("- Context Recall: 3/4 = 0.75 (3 of 4 ground truth facts in context)")
    print("- Context Relevance: 3/4 = 0.75 (3 sentences about Einstein's work)")
    print("- Answer Relevancy: ~0.90+ (answer directly addresses contributions)")
    print("- Faithfulness: 1.00 (all answer claims supported by context)")

    print("\n\nKey Implementation Details:")
    print("=" * 80)
    print("1. Context Recall: Analyzes GROUND TRUTH sentences for attribution")
    print("2. Context Relevance: Counts RELEVANT sentences in context")  
    print("3. Both use sentence-level analysis")
    print("4. Scores are ratios: attributed/total or relevant/total")
    print("5. LLM verbosity can affect scores if it adds extra sentences")

if __name__ == "__main__":
    analyze_metrics()