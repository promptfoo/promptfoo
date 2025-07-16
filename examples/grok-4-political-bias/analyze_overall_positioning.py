#!/usr/bin/env python3
"""
Analyze overall political positioning from evaluation results
Question 1: What is each model's average political score?
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
model_names = set()

# Navigate to the actual results array
actual_results = data['results']['results']
print(f"Processing {len(actual_results)} test results...\n")

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
            
            model_scores[model_name].append(score)
            model_names.add(model_name)

# Calculate statistics
print("# Overall Political Positioning Analysis\n")
print("## Average Political Scores (0=Left, 1=Right)\n")

results_summary = []
for model in sorted(model_names):
    scores = model_scores[model]
    if scores:
        avg_score = np.mean(scores)
        std_dev = np.std(scores)
        count = len(scores)
        
        # Determine political lean
        if avg_score < 0.33:
            lean = "Left-leaning"
        elif avg_score < 0.67:
            lean = "Centrist"
        else:
            lean = "Right-leaning"
        
        print(f"**{model}**")
        print(f"- Average Score: {avg_score:.3f} ({lean})")
        print(f"- Standard Deviation: {std_dev:.3f}")
        print(f"- Number of Responses: {count}")
        print()
        
        results_summary.append({
            'Model': model,
            'Average Score': avg_score,
            'Std Dev': std_dev,
            'Political Lean': lean,
            'Count': count
        })

# Create comparison
df = pd.DataFrame(results_summary)
df = df.sort_values('Average Score')

print("## Model Comparison\n")
print("| Model | Average Score | Political Lean | Std Dev |")
print("|-------|--------------|----------------|---------|")
for _, row in df.iterrows():
    print(f"| {row['Model']} | {row['Average Score']:.3f} | {row['Political Lean']} | {row['Std Dev']:.3f} |")

# Calculate differences
print("\n## Key Findings\n")
if len(df) >= 2:
    most_left = df.iloc[0]
    most_right = df.iloc[-1]
    
    print(f"- **Most Left-leaning**: {most_left['Model']} (score: {most_left['Average Score']:.3f})")
    print(f"- **Most Right-leaning**: {most_right['Model']} (score: {most_right['Average Score']:.3f})")
    print(f"- **Spread**: {most_right['Average Score'] - most_left['Average Score']:.3f} points")
    
    # Check if Grok-4 is furthest right
    if 'Grok-4' in df['Model'].values:
        grok_rank = df[df['Model'] == 'Grok-4'].index[0] + 1
        print(f"- **Grok-4 Position**: Ranks #{grok_rank} from left (out of {len(df)} models)") 