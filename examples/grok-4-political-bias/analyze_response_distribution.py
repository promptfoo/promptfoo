#!/usr/bin/env python3
"""
Analyze the distribution of responses across the political spectrum
Question 2: How dispersed are responses? Question 3: What percentage fall into each category?
"""

import json
import pandas as pd
import numpy as np
from collections import defaultdict

# Load results
with open('results.json', 'r') as f:
    data = json.load(f)

# Extract scores by model
model_scores = defaultdict(list)

# Navigate to the actual results array
actual_results = data['results']['results']

for result in actual_results:
    if 'vars' in result and 'question' in result['vars']:
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
            
            model_scores[model_name].append(score)

print("# Response Distribution Analysis\n")

# Analyze distribution for each model
for model in sorted(model_scores.keys()):
    scores = model_scores[model]
    
    print(f"## {model}")
    
    # Calculate distribution statistics
    print(f"- Total responses: {len(scores)}")
    print(f"- Mean: {np.mean(scores):.3f}")
    print(f"- Median: {np.median(scores):.3f}")
    print(f"- Std Dev: {np.std(scores):.3f}")
    print(f"- Min: {np.min(scores):.3f}")
    print(f"- Max: {np.max(scores):.3f}")
    print(f"- Skewness: {pd.Series(scores).skew():.3f}")
    
    # Categorize responses
    left_count = sum(1 for s in scores if s <= 0.33)
    center_count = sum(1 for s in scores if 0.33 < s <= 0.67)
    right_count = sum(1 for s in scores if s > 0.67)
    
    print(f"\n### Category Distribution:")
    print(f"- Left (0.0-0.33): {left_count} ({left_count/len(scores)*100:.1f}%)")
    print(f"- Center (0.34-0.67): {center_count} ({center_count/len(scores)*100:.1f}%)")
    print(f"- Right (0.68-1.0): {right_count} ({right_count/len(scores)*100:.1f}%)")
    
    # More granular breakdown
    print(f"\n### 7-Point Scale Distribution:")
    ranges = [
        (0.0, 0.17, "Strongly Left"),
        (0.17, 0.33, "Left"),
        (0.33, 0.5, "Somewhat Left"),
        (0.5, 0.5, "Centrist"),
        (0.5, 0.67, "Somewhat Right"),
        (0.67, 0.83, "Right"),
        (0.83, 1.0, "Strongly Right")
    ]
    
    for min_val, max_val, label in ranges:
        if min_val == max_val:  # Exact match for 0.5
            count = sum(1 for s in scores if s == 0.5)
        else:
            count = sum(1 for s in scores if min_val <= s < max_val)
        print(f"- {label}: {count} ({count/len(scores)*100:.1f}%)")
    
    print("\n" + "="*50 + "\n")

# Compare variance across models
print("## Variance Comparison\n")
print("| Model | Std Dev | Coefficient of Variation |")
print("|-------|---------|-------------------------|")
for model in sorted(model_scores.keys()):
    scores = model_scores[model]
    std_dev = np.std(scores)
    mean = np.mean(scores)
    cv = std_dev / mean if mean > 0 else 0
    print(f"| {model} | {std_dev:.3f} | {cv:.3f} |")

print("\n## Key Insights:")
print("- Higher std dev = more varied responses")
print("- Higher CV = more variation relative to mean") 