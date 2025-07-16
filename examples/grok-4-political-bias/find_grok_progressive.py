#!/usr/bin/env python3
"""
Find questions where Grok-4 is more progressive (left) than other models
Question 21: Which questions show "inverted" political positions?
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

# Find questions where Grok-4 is more progressive
grok_more_progressive = []
grok_more_conservative = []

for question, scores in question_scores.items():
    if 'Grok-4' in scores and len(scores) == 3:
        grok_score = scores['Grok-4']
        other_scores = [s for m, s in scores.items() if m != 'Grok-4']
        avg_others = np.mean(other_scores)
        
        # Grok is more progressive if it scores lower (left)
        diff = grok_score - avg_others
        
        if diff < -0.3:  # Significantly more progressive
            grok_more_progressive.append({
                'question': question,
                'grok_score': grok_score,
                'avg_others': avg_others,
                'difference': diff,
                'all_scores': scores
            })
        elif diff > 0.3:  # Significantly more conservative
            grok_more_conservative.append({
                'question': question,
                'grok_score': grok_score,
                'avg_others': avg_others,
                'difference': diff,
                'all_scores': scores
            })

# Sort by difference magnitude
grok_more_progressive.sort(key=lambda x: x['difference'])
grok_more_conservative.sort(key=lambda x: x['difference'], reverse=True)

print("# Grok-4 Political Inversion Analysis\n")

print(f"## Cases where Grok-4 is MORE PROGRESSIVE than others\n")
print(f"Found {len(grok_more_progressive)} questions where Grok-4 is >0.3 points more left\n")

for i, item in enumerate(grok_more_progressive[:10], 1):
    print(f"**{i}. Question:** {item['question'][:100]}...")
    print(f"   - Grok-4: {item['grok_score']:.2f} (more left)")
    print(f"   - GPT-4.1: {item['all_scores']['GPT-4.1']:.2f}")
    print(f"   - Gemini 2.5 Flash: {item['all_scores']['Gemini 2.5 Flash']:.2f}")
    print(f"   - Difference: {item['difference']:.2f}")
    print()

print(f"\n## Cases where Grok-4 is MORE CONSERVATIVE than others\n")
print(f"Found {len(grok_more_conservative)} questions where Grok-4 is >0.3 points more right\n")

for i, item in enumerate(grok_more_conservative[:5], 1):
    print(f"**{i}. Question:** {item['question'][:100]}...")
    print(f"   - Grok-4: {item['grok_score']:.2f} (more right)")
    print(f"   - GPT-4.1: {item['all_scores']['GPT-4.1']:.2f}")
    print(f"   - Gemini 2.5 Flash: {item['all_scores']['Gemini 2.5 Flash']:.2f}")
    print(f"   - Difference: +{item['difference']:.2f}")
    print()

# Analyze patterns
print("\n## Pattern Analysis\n")
print(f"- Grok-4 is more progressive on {len(grok_more_progressive)} questions ({len(grok_more_progressive)/len(question_scores)*100:.1f}%)")
print(f"- Grok-4 is more conservative on {len(grok_more_conservative)} questions ({len(grok_more_conservative)/len(question_scores)*100:.1f}%)")
print(f"- Ratio: {len(grok_more_progressive)/len(grok_more_conservative):.2f}:1 progressive vs conservative divergences") 