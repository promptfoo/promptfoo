#!/usr/bin/env python3
"""
Analyze how Grok-4 treats competitor companies
Question 5: How does Grok 4 treat competitor companies (Google, Meta, Microsoft)?
Question 6: Which specific corporate topics show the largest bias differential?
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

# Identify corporate questions with more specific keywords
company_keywords = {
    'Musk/X': ['elon', 'musk', 'tesla', 'spacex', 'neuralink', 'boring company', 'x platform', 'twitter', 'x corp'],
    'Google': ['google', 'alphabet', 'youtube', 'android', 'chrome', 'waymo', 'deepmind', 'gemini'],
    'Meta': ['meta', 'facebook', 'instagram', 'whatsapp', 'oculus', 'zuckerberg'],
    'Microsoft': ['microsoft', 'windows', 'azure', 'github', 'openai', 'bing', 'copilot'],
    'Amazon': ['amazon', 'aws', 'alexa', 'bezos', 'prime'],
    'Apple': ['apple', 'iphone', 'ios', 'app store', 'tim cook']
}

# Topic keywords for corporate questions
topic_keywords = {
    'Content Moderation': ['moderation', 'censorship', 'free speech', 'content policy', 'deplatform'],
    'Antitrust': ['monopoly', 'antitrust', 'competition', 'break up', 'market power'],
    'Privacy': ['privacy', 'data collection', 'surveillance', 'tracking'],
    'AI Regulation': ['ai regulation', 'ai safety', 'ai governance', 'ai ethics'],
    'CEO Power': ['ceo', 'executive', 'leadership', 'founder control']
}

def categorize_question_detailed(question_text):
    """Categorize a question by company and topic"""
    q_lower = question_text.lower()
    
    company = 'General'
    for comp, keywords in company_keywords.items():
        if any(keyword in q_lower for keyword in keywords):
            company = comp
            break
    
    topic = 'Other'
    for top, keywords in topic_keywords.items():
        if any(keyword in q_lower for keyword in keywords):
            topic = top
            break
    
    return company, topic

# Map questions to categories
question_mapping = {}
for _, row in questions_df.iterrows():
    company, topic = categorize_question_detailed(row['question'])
    question_mapping[row['question']] = {'company': company, 'topic': topic}

# Extract scores by model and category
model_company_scores = defaultdict(lambda: defaultdict(list))
model_topic_scores = defaultdict(lambda: defaultdict(list))
company_topic_scores = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))

# Navigate to the actual results array
actual_results = data['results']['results']

for result in actual_results:
    if 'vars' in result and 'question' in result['vars']:
        question = result['vars']['question']
        mapping = question_mapping.get(question, {'company': 'General', 'topic': 'Other'})
        company = mapping['company']
        topic = mapping['topic']
        
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
            
            model_company_scores[model_name][company].append(score)
            if company != 'General':
                model_topic_scores[model_name][topic].append(score)
                company_topic_scores[model_name][company][topic].append(score)

print("# Competitor Treatment Analysis\n")

# Focus on Grok-4's treatment of different companies
print("## Grok-4's Treatment of Tech Companies\n")

if 'Grok-4' in model_company_scores:
    companies = ['Musk/X', 'Google', 'Meta', 'Microsoft', 'Amazon', 'Apple']
    grok_company_stats = []
    
    for company in companies:
        if company in model_company_scores['Grok-4']:
            scores = model_company_scores['Grok-4'][company]
            if len(scores) > 0:
                grok_company_stats.append({
                    'Company': company,
                    'Avg Score': np.mean(scores),
                    'Count': len(scores),
                    'Std Dev': np.std(scores)
                })
    
    df = pd.DataFrame(grok_company_stats)
    if not df.empty:
        df = df.sort_values('Avg Score')
        print("| Company | Avg Score | Count | Interpretation |")
        print("|---------|-----------|-------|----------------|")
        for _, row in df.iterrows():
            interp = "More critical" if row['Avg Score'] < 0.5 else "More favorable"
            print(f"| {row['Company']} | {row['Avg Score']:.3f} | {row['Count']} | {interp} |")

print("\n## Cross-Model Comparison by Company\n")

# Compare all models on each company
for company in ['Google', 'Meta', 'Microsoft', 'Amazon', 'Apple']:
    print(f"\n### {company}")
    company_comparison = []
    
    for model in sorted(model_company_scores.keys()):
        if company in model_company_scores[model]:
            scores = model_company_scores[model][company]
            if len(scores) > 0:
                company_comparison.append({
                    'Model': model,
                    'Avg Score': np.mean(scores),
                    'Count': len(scores)
                })
    
    if company_comparison:
        df_comp = pd.DataFrame(company_comparison)
        df_comp = df_comp.sort_values('Avg Score')
        for _, row in df_comp.iterrows():
            print(f"- {row['Model']}: {row['Avg Score']:.3f} (n={row['Count']})")

print("\n## Topic-Specific Bias Differentials\n")

# Analyze which topics show the largest differences
if 'Grok-4' in model_topic_scores:
    print("### Grok-4's Stance by Corporate Topic")
    topic_stats = []
    
    for topic in topic_keywords.keys():
        if topic in model_topic_scores['Grok-4']:
            scores = model_topic_scores['Grok-4'][topic]
            if len(scores) > 5:
                topic_stats.append({
                    'Topic': topic,
                    'Avg Score': np.mean(scores),
                    'Count': len(scores),
                    'Std Dev': np.std(scores)
                })
    
    if topic_stats:
        df_topic = pd.DataFrame(topic_stats)
        df_topic = df_topic.sort_values('Avg Score')
        print("\n| Topic | Avg Score | Count | Stance |")
        print("|-------|-----------|-------|--------|")
        for _, row in df_topic.iterrows():
            if row['Avg Score'] < 0.33:
                stance = "Progressive"
            elif row['Avg Score'] < 0.67:
                stance = "Moderate"
            else:
                stance = "Conservative"
            print(f"| {row['Topic']} | {row['Avg Score']:.3f} | {row['Count']} | {stance} |")

# Find specific examples of differential treatment
print("\n## Examples of Differential Treatment\n")

# Compare Musk/X vs other tech companies on similar topics
if 'Grok-4' in company_topic_scores:
    for topic in ['Content Moderation', 'Antitrust', 'CEO Power']:
        print(f"\n### {topic} Questions:")
        
        topic_comparison = []
        for company in ['Musk/X', 'Google', 'Meta']:
            if company in company_topic_scores['Grok-4'] and topic in company_topic_scores['Grok-4'][company]:
                scores = company_topic_scores['Grok-4'][company][topic]
                if len(scores) > 0:
                    avg_score = np.mean(scores)
                    topic_comparison.append(f"{company}: {avg_score:.3f} (n={len(scores)})")
        
        if topic_comparison:
            print("Grok-4's scores: " + ", ".join(topic_comparison)) 