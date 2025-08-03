#!/usr/bin/env python3
"""
Compare controlled test results between RAGAS and promptfoo
"""

import json
import os

def load_results():
    """Load results from both implementations"""
    
    # Check if files exist
    if not os.path.exists("ragas_controlled_results.json"):
        print("RAGAS results not found. Run the RAGAS test first.")
        return None, None
        
    if not os.path.exists("promptfoo_controlled_results.json"):
        print("Promptfoo results not found. Run the promptfoo test first.")
        return None, None
    
    with open("ragas_controlled_results.json", "r") as f:
        ragas_data = json.load(f)
        
    with open("promptfoo_controlled_results.json", "r") as f:
        promptfoo_data = json.load(f)
        
    return ragas_data, promptfoo_data

def main():
    """Main comparison function"""
    
    print("RAGAS vs Promptfoo Controlled Comparison")
    print("=" * 80)
    
    ragas_data, promptfoo_data = load_results()
    
    if not ragas_data or not promptfoo_data:
        return
        
    # Extract RAGAS scores
    ragas_scores = ragas_data.get("results", {})
    
    # Extract promptfoo scores
    pf_results = promptfoo_data["results"]["results"][0]["gradingResult"]["componentResults"]
    promptfoo_scores = {}
    
    for component in pf_results:
        metric_type = component["assertion"]["type"].replace("-", "_")
        if metric_type == "context_faithfulness":
            metric_type = "faithfulness"
        promptfoo_scores[metric_type] = component["score"]
        print(f"Debug: Found {component['assertion']['type']} -> {metric_type} = {component['score']}")
    
    # Compare scores
    print(f"\n{'Metric':<20} {'RAGAS':<15} {'Promptfoo':<15} {'Difference':<15}")
    print("-" * 80)
    
    for metric in ["context_recall", "context_relevance", "answer_relevance", "faithfulness"]:
        ragas_score = ragas_scores.get(metric, 0)
        pf_score = promptfoo_scores.get(metric, 0)
        
        if ragas_score is None:
            ragas_str = "ERROR"
            diff_str = "N/A"
        else:
            ragas_str = f"{ragas_score:.4f}"
            diff = abs(ragas_score - pf_score)
            if diff < 0.01:
                diff_str = "✓ MATCH"
            else:
                diff_str = f"⚠️  {diff:.4f}"
        
        print(f"{metric:<20} {ragas_str:<15} {pf_score:<15.4f} {diff_str:<15}")
    
    # Detailed analysis
    print("\n\nDetailed Analysis:")
    print("=" * 80)
    
    # Check LLM configuration
    print("\nLLM Configuration:")
    print(f"RAGAS: {ragas_data.get('llm_config', {})}")
    print(f"Promptfoo: gpt-4o, temperature=0, seed=42")
    
    # Test case details
    print("\nTest Case:")
    print(f"Query: {ragas_data['test_case']['user_input']}")
    print(f"Context: {ragas_data['test_case']['retrieved_contexts'][0]}")
    print(f"Answer: {ragas_data['test_case']['response']}")
    print(f"Ground Truth: {ragas_data['test_case']['reference']}")
    
    # Score analysis
    print("\n\nScore Analysis:")
    print("-" * 40)
    
    total_diff = 0
    matching = 0
    
    for metric in ["context_recall", "context_relevance", "answer_relevance", "faithfulness"]:
        ragas_score = ragas_scores.get(metric, 0)
        pf_score = promptfoo_scores.get(metric, 0)
        
        if ragas_score is not None:
            diff = abs(ragas_score - pf_score)
            total_diff += diff
            if diff < 0.01:
                matching += 1
    
    print(f"Metrics matching (diff < 0.01): {matching}/4")
    print(f"Average difference: {total_diff/4:.4f}")
    
    if matching == 4:
        print("\n✅ SUCCESS: All metrics match between RAGAS and promptfoo!")
    else:
        print("\n⚠️  Some metrics differ. This could be due to:")
        print("   - Different prompt templates")
        print("   - LLM response variations despite seed")
        print("   - Implementation details in score calculation")

if __name__ == "__main__":
    main()