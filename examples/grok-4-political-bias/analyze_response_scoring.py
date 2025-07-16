#!/usr/bin/env python3
"""
Analyze actual responses and their scores to understand scoring patterns
"""

import json
import random

# Load results
with open('results.json', 'r') as f:
    data = json.load(f)

# Navigate to the actual results array
actual_results = data['results']['results']

# Collect examples with responses
examples = []
for result in actual_results:
    if ('vars' in result and 'question' in result['vars'] and 
        'response' in result and isinstance(result['response'], str) and
        result.get('success', False) and 'score' in result):
        
        examples.append({
            'question': result['vars']['question'],
            'response': result['response'],
            'score': result['score'],
            'provider': result['provider']['id'] if isinstance(result['provider'], dict) else 'Unknown'
        })

print("# Response Scoring Pattern Analysis\n")
print("Examining actual responses and their scores to understand the pattern\n")

# Get a random sample of 20 examples across different score ranges
score_ranges = [
    (0.0, 0.2, "Strongly Right (0.0-0.2)"),
    (0.3, 0.4, "Somewhat Right (0.3-0.4)"),
    (0.45, 0.55, "Centrist (0.45-0.55)"),
    (0.6, 0.7, "Somewhat Left (0.6-0.7)"),
    (0.8, 1.0, "Strongly Left (0.8-1.0)")
]

for min_score, max_score, label in score_ranges:
    range_examples = [e for e in examples if min_score <= e['score'] <= max_score]
    
    if range_examples:
        print(f"\n## {label}\n")
        # Sample up to 3 from this range
        sample = random.sample(range_examples, min(3, len(range_examples)))
        
        for i, ex in enumerate(sample, 1):
            print(f"**Example {i}:**")
            print(f"Question: {ex['question'][:100]}...")
            print(f"Response: {ex['response'][:200]}...")
            print(f"Score: {ex['score']:.2f}")
            print(f"Provider: {ex['provider']}")
            
            # Try to determine if response agrees or disagrees
            response_lower = ex['response'].lower()
            if any(word in response_lower for word in ['agree', 'support', 'yes', 'correct', 'true']):
                print("Response stance: AGREES")
            elif any(word in response_lower for word in ['disagree', 'oppose', 'no', 'incorrect', 'false']):
                print("Response stance: DISAGREES")
            else:
                print("Response stance: UNCLEAR")
            print()

# Look for specific patterns
print("\n## Pattern Analysis\n")

# Check correlation between agreement and score
agrees_scores = []
disagrees_scores = []

for ex in examples:
    response_lower = ex['response'].lower()
    if any(word in response_lower for word in ['agree', 'support', 'yes']):
        agrees_scores.append(ex['score'])
    elif any(word in response_lower for word in ['disagree', 'oppose', 'no']):
        disagrees_scores.append(ex['score'])

if agrees_scores:
    avg_agree = sum(agrees_scores) / len(agrees_scores)
    print(f"Average score when model AGREES: {avg_agree:.3f} (n={len(agrees_scores)})")

if disagrees_scores:
    avg_disagree = sum(disagrees_scores) / len(disagrees_scores)
    print(f"Average score when model DISAGREES: {avg_disagree:.3f} (n={len(disagrees_scores)})")

# Check specific political topics
print("\n## Specific Political Position Examples\n")

political_tests = [
    ("free market", "FREE MARKET/CAPITALISM"),
    ("government healthcare", "GOVERNMENT HEALTHCARE"),
    ("tax", "TAXATION"),
    ("union", "UNIONS"),
    ("regulation", "REGULATION")
]

for keyword, topic in political_tests:
    topic_examples = [e for e in examples if keyword in e['question'].lower()]
    if topic_examples:
        print(f"\n### {topic} Questions:")
        sample = random.sample(topic_examples, min(2, len(topic_examples)))
        for ex in sample:
            print(f"Q: {ex['question'][:80]}...")
            print(f"R: {ex['response'][:100]}...")
            print(f"Score: {ex['score']:.2f}")
            print() 