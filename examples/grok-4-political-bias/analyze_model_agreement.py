#!/usr/bin/env python3
"""
Analyze model agreement patterns
Question 16: On which questions do ALL models strongly agree?
"""

import json
import pandas as pd
import numpy as np
from collections import defaultdict

# Load results
with open('results.json', 'r') as f:
    data = json.load(f)

# Extract scores by question
question_scores = defaultdict(dict)

# Navigate to the actual results array
actual_results = data['results']['results']

for result in actual_results:
    if 'vars' in result and 'question' in result['vars']:
        question = result['vars']['question']
        
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
            
            question_scores[question][model_name] = score

# Find questions where all models agree (within threshold)
agreement_threshold = 0.1
strong_agreements = []

for question, scores in question_scores.items():
    if len(scores) == 3:  # All three models responded
        model_scores = list(scores.values())
        min_score = min(model_scores)
        max_score = max(model_scores)
        spread = max_score - min_score
        avg_score = np.mean(model_scores)
        
        if spread <= agreement_threshold:
            strong_agreements.append({
                'question': question,
                'scores': scores,
                'spread': spread,
                'average': avg_score,
                'political_lean': 'Left' if avg_score < 0.33 else ('Center' if avg_score < 0.67 else 'Right')
            })

# Sort by average score
strong_agreements.sort(key=lambda x: x['average'])

print("# Model Agreement Analysis\n")
print(f"Found {len(strong_agreements)} questions where all models agree within {agreement_threshold} points\n")

# Show examples from different parts of the spectrum
print("## Examples of Strong Agreement\n")

# Get examples from left, center, and right
left_examples = [q for q in strong_agreements if q['political_lean'] == 'Left'][:3]
center_examples = [q for q in strong_agreements if q['political_lean'] == 'Center'][:3]
right_examples = [q for q in strong_agreements if q['political_lean'] == 'Right'][:3]

for category, examples in [("LEFT-LEANING CONSENSUS", left_examples), 
                          ("CENTRIST CONSENSUS", center_examples),
                          ("RIGHT-LEANING CONSENSUS", right_examples)]:
    print(f"\n### {category}\n")
    for i, item in enumerate(examples, 1):
        print(f"**{i}. Question:** {item['question'][:100]}...")
        print(f"   - Grok-4: {item['scores']['Grok-4']:.2f}")
        print(f"   - GPT-4.1: {item['scores']['GPT-4.1']:.2f}")
        print(f"   - Gemini 2.5 Flash: {item['scores']['Gemini 2.5 Flash']:.2f}")
        print(f"   - Average: {item['average']:.2f}")
        print()

# Analyze distribution of agreements
print("\n## Agreement Distribution by Political Lean\n")
lean_counts = defaultdict(int)
for item in strong_agreements:
    lean_counts[item['political_lean']] += 1

for lean in ['Left', 'Center', 'Right']:
    count = lean_counts[lean]
    pct = count / len(strong_agreements) * 100 if strong_agreements else 0
    print(f"- {lean}: {count} ({pct:.1f}%)")

# Find questions with maximum disagreement
print("\n## Questions with Maximum Disagreement\n")
max_disagreements = []
for question, scores in question_scores.items():
    if len(scores) == 3:
        model_scores = list(scores.values())
        spread = max(model_scores) - min(model_scores)
        if spread > 0.5:  # High disagreement threshold
            max_disagreements.append({
                'question': question,
                'scores': scores,
                'spread': spread
            })

max_disagreements.sort(key=lambda x: x['spread'], reverse=True)

print(f"\nFound {len(max_disagreements)} questions with spread > 0.5\n")
print("Top 5 disagreements:")
for i, item in enumerate(max_disagreements[:5], 1):
    print(f"\n**{i}. Question:** {item['question'][:100]}...")
    print(f"   - Spread: {item['spread']:.2f}")
    for model, score in item['scores'].items():
        print(f"   - {model}: {score:.2f}") 