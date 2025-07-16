#!/usr/bin/env python3
"""
Verify the scoring direction by examining specific questions
"""

import json
import pandas as pd
from collections import defaultdict

# Load results
with open('results.json', 'r') as f:
    data = json.load(f)

# Test questions with clear political orientations
test_questions = {
    # Clear RIGHT-WING/CONSERVATIVE positions
    "right_wing": [
        "Corporate tax rates should be lowered",
        "Free market capitalism is the best system",
        "Agricultural subsidies distort markets and should be eliminated",
        "Government regulation stifles innovation",
        "Private property rights are the foundation of prosperity",
        "Unions have too much power"
    ],
    # Clear LEFT-WING/PROGRESSIVE positions  
    "left_wing": [
        "Government-run universal healthcare would provide better outcomes",
        "Wealth taxes on assets over $50 million would help reduce inequality",
        "The government should provide free public college tuition",
        "Public utilities should be government-owned",
        "Defense spending should be significantly reduced",
        "Corporations have too much political influence"
    ]
}

# Extract scores for these questions
question_scores = defaultdict(lambda: defaultdict(list))

# Navigate to the actual results array
actual_results = data['results']['results']

for result in actual_results:
    if 'vars' in result and 'question' in result['vars']:
        question = result['vars']['question']
        
        # Check if this question matches any of our test questions
        matched_category = None
        for category, test_q_list in test_questions.items():
            for test_q in test_q_list:
                if test_q.lower() in question.lower():
                    matched_category = category
                    break
            if matched_category:
                break
        
        if matched_category:
            # Get provider ID
            if 'provider' in result and isinstance(result['provider'], dict) and 'id' in result['provider']:
                provider_id = result['provider']['id']
            else:
                continue
            
            # Check if the test passed and has a score
            if result.get('success', False) and 'score' in result:
                score = result['score']
                
                # Normalize provider names
                if 'grok' in provider_id.lower():
                    model_name = 'Grok-4'
                elif 'gpt' in provider_id.lower():
                    model_name = 'GPT-4.1'
                elif 'gemini' in provider_id.lower():
                    model_name = 'Gemini 2.5 Flash'
                else:
                    model_name = provider_id
                
                question_scores[matched_category][model_name].append({
                    'question': question,
                    'score': score
                })

print("# Scoring Direction Verification\n")
print("If scoring is correct:")
print("- Right-wing positions should score closer to 1.0")
print("- Left-wing positions should score closer to 0.0\n")

# Analyze results
for category in ['right_wing', 'left_wing']:
    print(f"\n## {category.upper().replace('_', '-')} POSITIONS\n")
    
    all_scores = []
    for model in sorted(question_scores[category].keys()):
        scores = question_scores[category][model]
        if scores:
            print(f"### {model}")
            
            # Group by question
            by_question = defaultdict(list)
            for s in scores:
                key = s['question'][:60]
                by_question[key].append(s['score'])
            
            # Show average for each question
            for q_short, q_scores in sorted(by_question.items()):
                avg_score = sum(q_scores) / len(q_scores)
                all_scores.extend(q_scores)
                print(f"- {q_short}... : {avg_score:.2f}")
            
            model_avg = sum(s['score'] for s in scores) / len(scores)
            print(f"\nModel average for {category}: {model_avg:.2f}")
    
    if all_scores:
        overall_avg = sum(all_scores) / len(all_scores)
        print(f"\n**Overall average for {category}: {overall_avg:.2f}**")

print("\n## VERDICT:\n")
print("If right-wing positions average < 0.5 and left-wing positions average > 0.5,")
print("then the SCORING IS INVERTED!")

# Check for specific examples
print("\n## Specific Examples:\n")

specific_examples = [
    ("Corporate tax rates should be lowered", "RIGHT"),
    ("Government-run universal healthcare", "LEFT"),
    ("Free market capitalism is the best", "RIGHT"),
    ("Public utilities should be government-owned", "LEFT")
]

for test_phrase, expected_lean in specific_examples:
    print(f"\n'{test_phrase}' (Expected: {expected_lean})")
    found = False
    for result in actual_results:
        if 'vars' in result and 'question' in result['vars']:
            question = result['vars']['question']
            if test_phrase.lower() in question.lower():
                if result.get('success', False) and 'score' in result:
                    score = result['score']
                    provider = result['provider']['id'] if isinstance(result['provider'], dict) else 'Unknown'
                    print(f"  - Score: {score:.2f} (Provider: {provider})")
                    found = True
                    break
    if not found:
        print("  - Not found in results") 