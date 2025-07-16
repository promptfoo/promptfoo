#!/usr/bin/env python3
"""Analyze 4-model political bias from multi-judge results."""

import json
import pandas as pd
import numpy as np
from collections import defaultdict
import matplotlib.pyplot as plt
import seaborn as sns

def analyze_4_models():
    """Extract and analyze political positioning for all 4 models."""
    print("Loading multi-judge evaluation results...")
    
    with open('results-multi-judge.json', 'r') as f:
        data = json.load(f)
    
    # Extract all scores by model (averaging across judges)
    model_scores = defaultdict(list)
    model_responses = defaultdict(lambda: defaultdict(str))
    
    for test in data['results']['results']:
        if 'vars' not in test or 'gradingResult' not in test:
            continue
            
        question_id = test['vars']['id']
        question = test['vars']['question']
        provider = test.get('provider', {})
        
        if isinstance(provider, dict):
            provider_id = provider.get('id', '')
        else:
            provider_id = str(provider)
            
        model_name = provider_id.split(':')[1] if ':' in provider_id else provider_id
        
        # Get response
        response = test.get('response', {})
        if isinstance(response, dict):
            output = response.get('output', '')
        else:
            output = str(response)
            
        if model_name and output:
            model_responses[model_name][question_id] = output
        
        # Get average score across all judges
        if test['gradingResult'] and 'namedScores' in test['gradingResult']:
            scores = list(test['gradingResult']['namedScores'].values())
            avg_score = np.mean(scores) if scores else None
            
            if avg_score is not None:
                model_scores[model_name].append(avg_score)
    
    # Calculate statistics for each model
    print("\n=== 4-MODEL POLITICAL POSITIONING ===")
    print("(Scale: 1.0 = Strongly Left, 0.0 = Strongly Right)\n")
    
    model_stats = {}
    for model in ['gpt-4.1', 'gemini-2.5-pro', 'grok-4', 'claude-opus-4-20250514']:
        if model in model_scores and model_scores[model]:
            scores = model_scores[model]
            model_stats[model] = {
                'mean': np.mean(scores),
                'std': np.std(scores),
                'median': np.median(scores),
                'count': len(scores),
                'scores': scores
            }
    
    # Sort by mean score
    sorted_models = sorted(model_stats.items(), key=lambda x: x[1]['mean'], reverse=True)
    
    for model, stats in sorted_models:
        print(f"{model:<30} Mean: {stats['mean']:.3f}, Std: {stats['std']:.3f}, Median: {stats['median']:.3f}")
    
    # Analyze distribution
    print("\n\n=== POLITICAL DISTRIBUTION ===")
    for model, stats in sorted_models:
        scores = stats['scores']
        right = sum(1 for s in scores if s < 0.5) / len(scores) * 100
        center = sum(1 for s in scores if 0.4 <= s <= 0.6) / len(scores) * 100
        left = sum(1 for s in scores if s > 0.5) / len(scores) * 100
        
        # Extremism
        extreme_left = sum(1 for s in scores if s >= 0.9) / len(scores) * 100
        extreme_right = sum(1 for s in scores if s <= 0.1) / len(scores) * 100
        
        print(f"\n{model}:")
        print(f"  Right (<0.5): {right:.1f}%")
        print(f"  Center (0.4-0.6): {center:.1f}%")
        print(f"  Left (>0.5): {left:.1f}%")
        print(f"  Extreme positions: {extreme_left:.1f}% far left, {extreme_right:.1f}% far right")
    
    # Analyze Musk-related questions
    print("\n\n=== MUSK/X TOPIC ANALYSIS (4 MODELS) ===")
    
    questions_df = pd.read_csv('political-questions.csv')
    musk_keywords = ['Musk', 'Tesla', 'X (formerly Twitter)', 'SpaceX', 'xAI', 'Neuralink', 'Elon']
    musk_questions = questions_df[questions_df['question'].str.contains('|'.join(musk_keywords), case=False)]
    musk_ids = set(musk_questions['id'].values)
    
    # Extract Musk-specific scores
    musk_scores_by_model = defaultdict(list)
    
    for test in data['results']['results']:
        if 'vars' not in test or 'gradingResult' not in test:
            continue
            
        question_id = test['vars']['id']
        if question_id not in musk_ids:
            continue
            
        provider = test.get('provider', {})
        model_name = provider.get('id', '').split(':')[1] if isinstance(provider, dict) else ''
        
        if test['gradingResult'] and 'namedScores' in test['gradingResult']:
            scores = list(test['gradingResult']['namedScores'].values())
            avg_score = np.mean(scores) if scores else None
            
            if avg_score is not None:
                musk_scores_by_model[model_name].append(avg_score)
    
    print(f"\nFound {len(musk_ids)} Musk-related questions")
    print("\nModel              Musk Topics    Overall    Difference")
    print("-" * 55)
    
    for model, stats in sorted_models:
        if model in musk_scores_by_model and musk_scores_by_model[model]:
            musk_mean = np.mean(musk_scores_by_model[model])
            overall_mean = stats['mean']
            diff = musk_mean - overall_mean
            print(f"{model:<18} {musk_mean:.3f}        {overall_mean:.3f}      {diff:+.3f}")
    
    # Create visualizations
    create_4_model_visualizations(model_stats)
    
    return model_stats

def create_4_model_visualizations(model_stats):
    """Create updated visualizations for 4 models."""
    # Set style
    plt.style.use('seaborn-v0_8-darkgrid')
    colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4']  # Red, Teal, Blue, Green
    
    # 1. Political Spectrum Bar Chart
    fig, ax = plt.subplots(figsize=(10, 6))
    
    models = ['GPT-4.1', 'Gemini 2.5 Pro', 'Grok-4', 'Claude Opus 4']
    model_keys = ['gpt-4.1', 'gemini-2.5-pro', 'grok-4', 'claude-opus-4-20250514']
    means = [model_stats[key]['mean'] for key in model_keys]
    stds = [model_stats[key]['std'] for key in model_keys]
    
    bars = ax.bar(models, means, color=colors, alpha=0.8, edgecolor='black')
    ax.errorbar(models, means, yerr=stds, fmt='none', color='black', capsize=5)
    
    # Add value labels
    for bar, mean in zip(bars, means):
        ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.01,
                f'{mean:.3f}', ha='center', va='bottom', fontweight='bold')
    
    ax.set_ylim(0, 1)
    ax.set_ylabel('Political Score (1.0 = Left, 0.0 = Right)', fontsize=12)
    ax.set_title('Political Positioning of 4 Major AI Models', fontsize=16, fontweight='bold')
    ax.axhline(y=0.5, color='gray', linestyle='--', alpha=0.5, label='True Center')
    
    # Add political spectrum gradient
    gradient = np.linspace(0, 1, 256).reshape(1, -1)
    gradient = np.vstack((gradient, gradient))
    
    ax_gradient = fig.add_axes([0.125, 0.02, 0.775, 0.03])
    ax_gradient.imshow(gradient, aspect='auto', cmap='RdBu_r')
    ax_gradient.set_xticks([0, 128, 256])
    ax_gradient.set_xticklabels(['Right (0.0)', 'Center (0.5)', 'Left (1.0)'])
    ax_gradient.set_yticks([])
    
    plt.tight_layout()
    plt.savefig('4_models_political_spectrum.png', dpi=300, bbox_inches='tight')
    print("\nSaved: 4_models_political_spectrum.png")
    
    # 2. Distribution Comparison
    fig, axes = plt.subplots(2, 2, figsize=(12, 10))
    axes = axes.flatten()
    
    for idx, (model, key, color) in enumerate(zip(models, model_keys, colors)):
        ax = axes[idx]
        scores = model_stats[key]['scores']
        
        # Histogram
        n, bins, patches = ax.hist(scores, bins=20, alpha=0.7, color=color, edgecolor='black')
        
        # Statistics
        mean = np.mean(scores)
        median = np.median(scores)
        
        ax.axvline(mean, color='red', linestyle='--', linewidth=2, label=f'Mean: {mean:.3f}')
        ax.axvline(median, color='green', linestyle='--', linewidth=2, label=f'Median: {median:.3f}')
        ax.axvline(0.5, color='gray', linestyle=':', linewidth=2, alpha=0.5, label='Center')
        
        ax.set_title(f'{model} Distribution', fontsize=14, fontweight='bold')
        ax.set_xlabel('Political Score')
        ax.set_ylabel('Frequency')
        ax.legend()
        ax.set_xlim(0, 1)
    
    plt.tight_layout()
    plt.savefig('4_models_distribution.png', dpi=300, bbox_inches='tight')
    print("Saved: 4_models_distribution.png")
    
    plt.close('all')

if __name__ == "__main__":
    model_stats = analyze_4_models() 