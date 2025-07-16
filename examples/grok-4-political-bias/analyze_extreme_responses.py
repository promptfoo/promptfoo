#!/usr/bin/env python3
"""
Analyze extreme and centrist responses
Question 19: Which questions produce the most "centrist" responses?
Question 20: What are the most extreme responses from each model?
"""

import json
import pandas as pd
import numpy as np
from collections import defaultdict

# Load results
with open('results.json', 'r') as f:
    data = json.load(f)

# Extract scores by model and question
model_responses = defaultdict(list)
question_text_map = {}

# Navigate to the actual results array
actual_results = data['results']['results']

for result in actual_results:
    if 'vars' in result and 'question' in result['vars']:
        question = result['vars']['question']
        question_text_map[result.get('testIdx', 0)] = question
        
        # Get provider ID
        if 'provider' in result and isinstance(result['provider'], dict) and 'id' in result['provider']:
            provider_id = result['provider']['id']
        else:
            continue
        
        # Check if the test passed and has a score
        if result.get('success', False) and 'score' in result:
            score = result['score']
            # Extract text response if available
            response_text = ''
            if 'response' in result:
                if isinstance(result['response'], str):
                    response_text = result['response']
                elif isinstance(result['response'], dict) and 'output' in result['response']:
                    response_text = str(result['response']['output'])
            
            # Normalize provider names
            if 'grok' in provider_id.lower():
                model_name = 'Grok-4'
            elif 'gpt' in provider_id.lower():
                model_name = 'GPT-4.1'
            elif 'gemini' in provider_id.lower():
                model_name = 'Gemini 2.5 Flash'
            else:
                model_name = provider_id
            
            model_responses[model_name].append({
                'question': question,
                'score': score,
                'response': response_text,
                'test_idx': result.get('testIdx', 0)
            })

print("# Extreme and Centrist Response Analysis\n")

# Find most extreme responses for each model
print("## Most Extreme Responses by Model\n")

for model in sorted(model_responses.keys()):
    responses = model_responses[model]
    
    # Sort by score to find extremes
    sorted_responses = sorted(responses, key=lambda x: x['score'])
    
    print(f"### {model}\n")
    
    # Most left-wing responses
    print("**Most LEFT-WING responses (score = 0.00):**")
    left_extreme = [r for r in sorted_responses if r['score'] == 0.0][:3]
    for i, resp in enumerate(left_extreme, 1):
        print(f"\n{i}. **Question:** {resp['question'][:100]}...")
        print(f"   Score: {resp['score']:.2f}")
        if resp['response']:
            print(f"   Response: \"{resp['response'][:150]}...\"")
    
    # Most right-wing responses  
    print("\n**Most RIGHT-WING responses (score = 1.00):**")
    right_extreme = [r for r in sorted_responses if r['score'] == 1.0][-3:]
    for i, resp in enumerate(right_extreme, 1):
        print(f"\n{i}. **Question:** {resp['question'][:100]}...")
        print(f"   Score: {resp['score']:.2f}")
        if resp['response']:
            print(f"   Response: \"{resp['response'][:150]}...\"")
    
    print("\n" + "="*60 + "\n")

# Find most centrist responses
print("## Most Centrist Responses (0.4-0.6 range)\n")

# Collect all responses in centrist range
centrist_responses = defaultdict(list)
for model, responses in model_responses.items():
    for resp in responses:
        if 0.4 <= resp['score'] <= 0.6:
            centrist_responses[resp['question']].append({
                'model': model,
                'score': resp['score']
            })

# Find questions where all models are centrist
all_centrist_questions = []
for question, model_scores in centrist_responses.items():
    models_responding = {ms['model'] for ms in model_scores}
    if len(models_responding) == 3:  # All three models
        avg_score = np.mean([ms['score'] for ms in model_scores])
        spread = max(ms['score'] for ms in model_scores) - min(ms['score'] for ms in model_scores)
        all_centrist_questions.append({
            'question': question,
            'avg_score': avg_score,
            'spread': spread,
            'model_scores': model_scores
        })

# Sort by how close to 0.5
all_centrist_questions.sort(key=lambda x: abs(x['avg_score'] - 0.5))

print(f"Found {len(all_centrist_questions)} questions where ALL models give centrist responses\n")
print("Top 5 most centrist (closest to 0.5):\n")

for i, item in enumerate(all_centrist_questions[:5], 1):
    print(f"**{i}. Question:** {item['question'][:100]}...")
    print(f"   Average score: {item['avg_score']:.3f}")
    for ms in item['model_scores']:
        print(f"   - {ms['model']}: {ms['score']:.2f}")
    print()

# Analyze centrist avoidance
print("\n## Centrist Response Patterns\n")

for model in sorted(model_responses.keys()):
    responses = model_responses[model]
    total = len(responses)
    centrist_count = sum(1 for r in responses if 0.4 <= r['score'] <= 0.6)
    exact_center = sum(1 for r in responses if r['score'] == 0.5)
    
    print(f"**{model}:**")
    print(f"- Centrist responses (0.4-0.6): {centrist_count}/{total} ({centrist_count/total*100:.1f}%)")
    print(f"- Exact center (0.5): {exact_center}/{total} ({exact_center/total*100:.1f}%)")
    print()

# Find questions that produce strategic neutrality
print("## Strategic Neutrality Examples\n")

# Questions where models cluster around 0.5 despite controversial topic
strategic_neutral = []
for question, model_scores in centrist_responses.items():
    if len(model_scores) >= 2:
        scores = [ms['score'] for ms in model_scores]
        if all(0.45 <= s <= 0.55 for s in scores):
            # Check if question contains controversial keywords
            q_lower = question.lower()
            controversial_keywords = ['abortion', 'gun', 'immigration', 'trump', 'biden', 'vaccine', 'climate', 'transgender', 'police']
            if any(keyword in q_lower for keyword in controversial_keywords):
                strategic_neutral.append({
                    'question': question,
                    'scores': scores,
                    'models': [ms['model'] for ms in model_scores]
                })

if strategic_neutral:
    print("Questions with potential strategic neutrality (controversial topics, centrist scores):\n")
    for i, item in enumerate(strategic_neutral[:3], 1):
        print(f"**{i}. Question:** {item['question'][:100]}...")
        print(f"   Models responding centrally: {', '.join(item['models'])}")
        print(f"   Scores: {[f'{s:.2f}' for s in item['scores']]}")
        print() 