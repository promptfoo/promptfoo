#!/usr/bin/env python3
"""
Analyze corporate bias in political responses
Question 4: Does Grok 4 show favorability toward Elon Musk's companies?
"""

import json
import pandas as pd
import numpy as np
from collections import defaultdict
import scipy.stats as stats

# Load results
with open('results.json', 'r') as f:
    data = json.load(f)

# Load questions to identify corporate-related ones
questions_df = pd.read_csv('political-questions.csv')

# Identify corporate questions
musk_keywords = ['elon', 'musk', 'tesla', 'spacex', 'neuralink', 'boring company', 'x platform', 'twitter', 'x corp']
google_keywords = ['google', 'alphabet', 'youtube', 'android', 'chrome', 'waymo', 'deepmind']
meta_keywords = ['meta', 'facebook', 'instagram', 'whatsapp', 'oculus']
microsoft_keywords = ['microsoft', 'windows', 'azure', 'github', 'openai partnership']

def categorize_question(question_text):
    """Categorize a question based on keywords"""
    q_lower = question_text.lower()
    
    if any(keyword in q_lower for keyword in musk_keywords):
        return 'Musk/X'
    elif any(keyword in q_lower for keyword in google_keywords):
        return 'Google'
    elif any(keyword in q_lower for keyword in meta_keywords):
        return 'Meta'
    elif any(keyword in q_lower for keyword in microsoft_keywords):
        return 'Microsoft'
    elif 'ai' in q_lower or 'artificial intelligence' in q_lower:
        return 'AI Policy'
    else:
        return 'General'

# Map questions to categories
question_categories = {}
for _, row in questions_df.iterrows():
    question_categories[row['question']] = categorize_question(row['question'])

# Extract scores by model and category
model_category_scores = defaultdict(lambda: defaultdict(list))

# Navigate to the actual results array
actual_results = data['results']['results']

for result in actual_results:
    if 'vars' in result and 'question' in result['vars']:
        question = result['vars']['question']
        category = question_categories.get(question, 'General')
        
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
            
            model_category_scores[model_name][category].append(score)

print("# Corporate Bias Analysis\n")

# Analyze by model
for model in sorted(model_category_scores.keys()):
    print(f"## {model}\n")
    
    categories = model_category_scores[model]
    
    # Calculate average scores by category
    category_stats = []
    for category in ['Musk/X', 'Google', 'Meta', 'Microsoft', 'AI Policy', 'General']:
        if category in categories and len(categories[category]) > 0:
            scores = categories[category]
            avg_score = np.mean(scores)
            std_score = np.std(scores)
            count = len(scores)
            
            category_stats.append({
                'Category': category,
                'Avg Score': avg_score,
                'Std Dev': std_score,
                'Count': count
            })
    
    # Display results
    df = pd.DataFrame(category_stats)
    if not df.empty:
        print("| Category | Avg Score | Count | Std Dev |")
        print("|----------|-----------|-------|---------|")
        for _, row in df.iterrows():
            print(f"| {row['Category']} | {row['Avg Score']:.3f} | {row['Count']} | {row['Std Dev']:.3f} |")
    
    # Statistical tests
    if 'Musk/X' in categories and 'General' in categories:
        musk_scores = categories['Musk/X']
        general_scores = categories['General']
        
        if len(musk_scores) > 5 and len(general_scores) > 5:
            # T-test for difference
            t_stat, p_value = stats.ttest_ind(musk_scores, general_scores)
            
            print(f"\n### Musk/X vs General Questions:")
            print(f"- Musk/X average: {np.mean(musk_scores):.3f}")
            print(f"- General average: {np.mean(general_scores):.3f}")
            print(f"- Difference: {np.mean(musk_scores) - np.mean(general_scores):.3f}")
            print(f"- T-statistic: {t_stat:.3f}")
            print(f"- P-value: {p_value:.3f}")
            
            if p_value < 0.05:
                direction = "MORE" if np.mean(musk_scores) > np.mean(general_scores) else "LESS"
                print(f"- **SIGNIFICANT**: {model} is {direction} favorable to Musk/X topics (p<0.05)")
            else:
                print(f"- No significant difference in treatment")
    
    print("\n" + "="*50 + "\n")

# Compare models on Musk/X topics specifically
print("## Cross-Model Comparison on Musk/X Topics\n")
musk_comparisons = []
for model in model_category_scores.keys():
    if 'Musk/X' in model_category_scores[model]:
        scores = model_category_scores[model]['Musk/X']
        if len(scores) > 0:
            musk_comparisons.append({
                'Model': model,
                'Avg Score': np.mean(scores),
                'Count': len(scores)
            })

df_musk = pd.DataFrame(musk_comparisons)
if not df_musk.empty:
    df_musk = df_musk.sort_values('Avg Score', ascending=False)
    print("| Model | Avg Score on Musk/X | Count |")
    print("|-------|-------------------|-------|")
    for _, row in df_musk.iterrows():
        print(f"| {row['Model']} | {row['Avg Score']:.3f} | {row['Count']} |") 