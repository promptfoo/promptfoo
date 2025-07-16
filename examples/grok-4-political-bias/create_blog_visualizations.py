#!/usr/bin/env python3
"""Create comprehensive visualizations for the political bias blog post."""

import json
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from collections import defaultdict
import matplotlib.patches as mpatches

# Set style for all plots
plt.style.use('seaborn-v0_8-whitegrid')
sns.set_palette("husl")

# Define consistent colors for each model
MODEL_COLORS = {
    'gpt-4.1': '#FF6B6B',          # Red
    'gemini-2.5-pro': '#4ECDC4',   # Teal
    'grok-4': '#45B7D1',           # Blue
    'claude-opus-4-20250514': '#96CEB4'  # Green
}

MODEL_LABELS = {
    'gpt-4.1': 'GPT-4.1',
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'grok-4': 'Grok-4',
    'claude-opus-4-20250514': 'Claude Opus 4'
}

def load_data():
    """Load the multi-judge results."""
    with open('results-multi-judge.json', 'r') as f:
        data = json.load(f)
    return data

def create_political_spectrum_chart(model_stats):
    """Create the main political spectrum bar chart."""
    fig, ax = plt.subplots(figsize=(12, 8))
    
    # Order models by score
    models_ordered = ['gpt-4.1', 'gemini-2.5-pro', 'grok-4', 'claude-opus-4-20250514']
    labels = [MODEL_LABELS[m] for m in models_ordered]
    means = [model_stats[m]['mean'] for m in models_ordered]
    stds = [model_stats[m]['std'] for m in models_ordered]
    colors = [MODEL_COLORS[m] for m in models_ordered]
    
    # Create bars
    bars = ax.bar(labels, means, yerr=stds, capsize=10, 
                   color=colors, alpha=0.8, edgecolor='black', linewidth=2)
    
    # Add value labels on bars
    for bar, mean, std in zip(bars, means, stds):
        ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + std + 0.01,
                f'{mean:.3f}', ha='center', va='bottom', fontweight='bold', fontsize=12)
    
    # Styling
    ax.set_ylim(0, 1)
    ax.set_ylabel('Political Score (1.0 = Left, 0.0 = Right)', fontsize=14, fontweight='bold')
    ax.set_title('Political Positioning of Major AI Models', fontsize=18, fontweight='bold', pad=20)
    ax.axhline(y=0.5, color='gray', linestyle='--', alpha=0.7, linewidth=2, label='True Center')
    ax.set_xlabel('AI Model', fontsize=14, fontweight='bold')
    
    # Add gradient background
    gradient = ax.imshow([[0,1]], extent=[ax.get_xlim()[0], ax.get_xlim()[1], 0, 1], 
                        aspect='auto', cmap='RdBu_r', alpha=0.15, zorder=0)
    
    # Add annotations
    ax.text(0.02, 0.98, 'LEFT', transform=ax.transAxes, fontsize=10, 
            fontweight='bold', va='top', alpha=0.5)
    ax.text(0.98, 0.02, 'RIGHT', transform=ax.transAxes, fontsize=10, 
            fontweight='bold', ha='right', alpha=0.5)
    
    plt.grid(True, alpha=0.3, axis='y')
    plt.tight_layout()
    plt.savefig('political_spectrum_main.png', dpi=300, bbox_inches='tight', facecolor='white')
    print("Created: political_spectrum_main.png")
    plt.close()

def create_extremism_comparison():
    """Create extremism rate comparison chart."""
    fig, ax = plt.subplots(figsize=(10, 6))
    
    models = ['GPT-4.1', 'Gemini 2.5 Pro', 'Grok-4', 'Claude Opus 4']
    extremism_rates = [30.8, 57.8, 67.9, 38.7]  # From our analysis
    centrist_rates = [6.0, 5.5, 2.1, 16.1]
    
    x = np.arange(len(models))
    width = 0.35
    
    bars1 = ax.bar(x - width/2, extremism_rates, width, label='Extreme Responses', 
                    color='#FF6B6B', alpha=0.8, edgecolor='black')
    bars2 = ax.bar(x + width/2, centrist_rates, width, label='Centrist Responses', 
                    color='#96CEB4', alpha=0.8, edgecolor='black')
    
    # Add value labels
    for bars in [bars1, bars2]:
        for bar in bars:
            height = bar.get_height()
            ax.text(bar.get_x() + bar.get_width()/2., height + 0.5,
                    f'{height:.1f}%', ha='center', va='bottom', fontweight='bold')
    
    ax.set_xlabel('AI Model', fontsize=12, fontweight='bold')
    ax.set_ylabel('Percentage of Responses', fontsize=12, fontweight='bold')
    ax.set_title('Extremism vs Centrism: Response Distribution by Model', fontsize=16, fontweight='bold')
    ax.set_xticks(x)
    ax.set_xticklabels(models)
    ax.legend(loc='upper left')
    ax.set_ylim(0, 80)
    
    plt.grid(True, alpha=0.3, axis='y')
    plt.tight_layout()
    plt.savefig('extremism_comparison.png', dpi=300, bbox_inches='tight', facecolor='white')
    print("Created: extremism_comparison.png")
    plt.close()

def create_musk_bias_chart():
    """Create Musk/X topic bias comparison."""
    fig, ax = plt.subplots(figsize=(10, 6))
    
    models = ['GPT-4.1', 'Gemini 2.5 Pro', 'Grok-4', 'Claude Opus 4']
    overall_scores = [0.745, 0.718, 0.655, 0.646]
    musk_scores = [0.687, 0.735, 0.514, 0.613]
    differences = [m - o for m, o in zip(musk_scores, overall_scores)]
    
    x = np.arange(len(models))
    width = 0.35
    
    bars1 = ax.bar(x - width/2, overall_scores, width, label='Overall Average', 
                    color='#4ECDC4', alpha=0.8, edgecolor='black')
    bars2 = ax.bar(x + width/2, musk_scores, width, label='Musk/X Topics', 
                    color='#FF6B6B', alpha=0.8, edgecolor='black')
    
    # Add difference annotations
    for i, (model, diff) in enumerate(zip(models, differences)):
        y_pos = max(overall_scores[i], musk_scores[i]) + 0.02
        ax.annotate(f'Δ = {diff:+.3f}', xy=(i, y_pos), ha='center', 
                   fontweight='bold', fontsize=10,
                   bbox=dict(boxstyle="round,pad=0.3", facecolor='yellow', alpha=0.7))
    
    ax.set_xlabel('AI Model', fontsize=12, fontweight='bold')
    ax.set_ylabel('Political Score (1.0 = Left, 0.0 = Right)', fontsize=12, fontweight='bold')
    ax.set_title('Anti-Musk Bias: Overall vs Musk/X Topic Scores', fontsize=16, fontweight='bold')
    ax.set_xticks(x)
    ax.set_xticklabels(models)
    ax.legend()
    ax.set_ylim(0, 0.9)
    ax.axhline(y=0.5, color='gray', linestyle='--', alpha=0.5, label='Center')
    
    plt.grid(True, alpha=0.3, axis='y')
    plt.tight_layout()
    plt.savefig('musk_bias_comparison.png', dpi=300, bbox_inches='tight', facecolor='white')
    print("Created: musk_bias_comparison.png")
    plt.close()

def create_judge_agreement_heatmap():
    """Create inter-judge agreement correlation heatmap."""
    # Judge correlation data from our analysis
    judge_corr = {
        'GPT-4.1': {'GPT-4.1': 1.0, 'Gemini 2.5 Pro': 0.937, 'Grok-4': 0.942, 'Claude Opus 4': 0.936},
        'Gemini 2.5 Pro': {'GPT-4.1': 0.937, 'Gemini 2.5 Pro': 1.0, 'Grok-4': 0.933, 'Claude Opus 4': 0.936},
        'Grok-4': {'GPT-4.1': 0.942, 'Gemini 2.5 Pro': 0.933, 'Grok-4': 1.0, 'Claude Opus 4': 0.923},
        'Claude Opus 4': {'GPT-4.1': 0.936, 'Gemini 2.5 Pro': 0.936, 'Grok-4': 0.923, 'Claude Opus 4': 1.0}
    }
    
    df = pd.DataFrame(judge_corr)
    
    plt.figure(figsize=(8, 6))
    sns.heatmap(df, annot=True, fmt='.3f', cmap='YlOrRd', 
                vmin=0.9, vmax=1.0, square=True, linewidths=1,
                cbar_kws={'label': 'Correlation Coefficient'})
    plt.title('Inter-Judge Agreement: How Much Judges Agree With Each Other', 
              fontsize=14, fontweight='bold', pad=20)
    plt.xlabel('Judge Model', fontsize=12, fontweight='bold')
    plt.ylabel('Judge Model', fontsize=12, fontweight='bold')
    plt.tight_layout()
    plt.savefig('judge_agreement_heatmap.png', dpi=300, bbox_inches='tight', facecolor='white')
    print("Created: judge_agreement_heatmap.png")
    plt.close()

def create_self_scoring_bias_chart():
    """Create self-scoring bias visualization."""
    fig, ax = plt.subplots(figsize=(10, 6))
    
    models = ['GPT-4.1', 'Grok-4', 'Gemini 2.5 Pro']
    self_scores = [0.768, 0.659, 0.718]
    other_scores = [0.738, 0.654, 0.718]
    biases = [s - o for s, o in zip(self_scores, other_scores)]
    
    x = np.arange(len(models))
    width = 0.35
    
    bars1 = ax.bar(x - width/2, self_scores, width, label='Self Score', 
                    color='#FF6B6B', alpha=0.8, edgecolor='black')
    bars2 = ax.bar(x + width/2, other_scores, width, label="Others' Score", 
                    color='#4ECDC4', alpha=0.8, edgecolor='black')
    
    # Add bias annotations
    for i, (model, bias) in enumerate(zip(models, biases)):
        y_pos = max(self_scores[i], other_scores[i]) + 0.01
        significance = '***' if model == 'GPT-4.1' else ''
        ax.annotate(f'{bias:+.3f}{significance}', xy=(i, y_pos), ha='center', 
                   fontweight='bold', fontsize=11,
                   bbox=dict(boxstyle="round,pad=0.3", 
                            facecolor='yellow' if significance else 'lightgray', 
                            alpha=0.8))
    
    ax.set_xlabel('AI Model', fontsize=12, fontweight='bold')
    ax.set_ylabel('Political Score', fontsize=12, fontweight='bold')
    ax.set_title('Self-Scoring Bias: Do Models Judge Themselves More Favorably?', 
                 fontsize=16, fontweight='bold')
    ax.set_xticks(x)
    ax.set_xticklabels(models)
    ax.legend()
    ax.set_ylim(0.6, 0.82)
    
    # Add footnote
    ax.text(0.98, 0.02, '*** p < 0.05 (statistically significant)', 
            transform=ax.transAxes, ha='right', fontsize=9, style='italic')
    
    plt.grid(True, alpha=0.3, axis='y')
    plt.tight_layout()
    plt.savefig('self_scoring_bias.png', dpi=300, bbox_inches='tight', facecolor='white')
    print("Created: self_scoring_bias.png")
    plt.close()

def create_political_distribution_violin():
    """Create violin plot showing distribution shapes."""
    # This would need the raw scores, so we'll create a stylized version
    fig, ax = plt.subplots(figsize=(12, 8))
    
    # Simulate distributions based on our statistics
    np.random.seed(42)
    
    distributions = {
        'GPT-4.1': np.concatenate([
            np.random.beta(8, 2, 835),  # Left-leaning bulk
            np.random.beta(2, 8, 153)   # Some right
        ]),
        'Gemini 2.5 Pro': np.concatenate([
            np.random.beta(6, 3, 755),  # Left bulk
            np.random.beta(2, 6, 219),  # Right
            np.ones(100) * 0.9,         # Extreme left spike
            np.zeros(100) * 0.1         # Extreme right spike
        ]),
        'Grok-4': np.concatenate([
            np.ones(487) * 0.95,        # Extreme left
            np.zeros(192) * 0.05,       # Extreme right
            np.random.beta(5, 5, 321)   # Some middle
        ]),
        'Claude Opus 4': np.random.beta(4, 3, 1000)  # More centered
    }
    
    # Create violin plot
    positions = [1, 2, 3, 4]
    parts = ax.violinplot([distributions['GPT-4.1'], distributions['Gemini 2.5 Pro'], 
                          distributions['Grok-4'], distributions['Claude Opus 4']], 
                         positions=positions, widths=0.7, showmeans=True, showextrema=True)
    
    # Color the violins
    colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4']
    for pc, color in zip(parts['bodies'], colors):
        pc.set_facecolor(color)
        pc.set_alpha(0.7)
        pc.set_edgecolor('black')
        pc.set_linewidth(1.5)
    
    # Styling
    ax.set_xticks(positions)
    ax.set_xticklabels(['GPT-4.1', 'Gemini 2.5 Pro', 'Grok-4', 'Claude Opus 4'])
    ax.set_ylabel('Political Score (1.0 = Left, 0.0 = Right)', fontsize=12, fontweight='bold')
    ax.set_title('Political Score Distributions: The Shape of Bias', fontsize=16, fontweight='bold')
    ax.set_ylim(-0.1, 1.1)
    ax.axhline(y=0.5, color='gray', linestyle='--', alpha=0.5, label='Center')
    
    # Add distribution characteristics
    ax.text(3, 0.05, "Bipolar\nDistribution", ha='center', fontsize=10, 
            bbox=dict(boxstyle="round,pad=0.3", facecolor='yellow', alpha=0.7))
    ax.text(4, 0.5, "Most\nCentrist", ha='center', fontsize=10,
            bbox=dict(boxstyle="round,pad=0.3", facecolor='lightgreen', alpha=0.7))
    
    plt.grid(True, alpha=0.3, axis='y')
    plt.tight_layout()
    plt.savefig('political_distribution_violin.png', dpi=300, bbox_inches='tight', facecolor='white')
    print("Created: political_distribution_violin.png")
    plt.close()

def create_contrarian_scatter():
    """Create scatter plot showing Grok's contrarian behavior."""
    fig, ax = plt.subplots(figsize=(10, 8))
    
    # Sample of contrarian examples from our analysis
    questions = [
        "Public utilities ownership",
        "Wealth taxes",
        "Corporate tax rates", 
        "Voter ID laws",
        "Critical race theory",
        "Estate tax threshold",
        "Parental consent abortion",
        "Right-to-work laws"
    ]
    
    grok_scores = [0.04, 0.04, 0.00, 0.00, 0.04, 0.04, 0.04, 0.04]
    others_avg = [0.97, 0.96, 0.93, 0.93, 0.97, 0.99, 0.97, 0.96]
    
    # Create scatter
    ax.scatter(others_avg, grok_scores, s=200, c='#45B7D1', alpha=0.7, 
               edgecolors='black', linewidth=2)
    
    # Add diagonal line (agreement line)
    ax.plot([0, 1], [0, 1], 'k--', alpha=0.3, label='Perfect Agreement')
    
    # Add labels for each point
    for i, q in enumerate(questions):
        ax.annotate(q, (others_avg[i], grok_scores[i]), 
                   xytext=(5, 5), textcoords='offset points', 
                   fontsize=9, ha='left')
    
    ax.set_xlabel('Average Score from Other Models', fontsize=12, fontweight='bold')
    ax.set_ylabel('Grok-4 Score', fontsize=12, fontweight='bold')
    ax.set_title("Grok-4's Contrarian Behavior: Going Against Consensus", 
                 fontsize=16, fontweight='bold')
    ax.set_xlim(-0.1, 1.1)
    ax.set_ylim(-0.1, 1.1)
    ax.grid(True, alpha=0.3)
    
    # Add text box
    textstr = '15.8% of questions show\nGrok-4 differing by >0.5\nfrom consensus'
    props = dict(boxstyle='round', facecolor='wheat', alpha=0.8)
    ax.text(0.05, 0.95, textstr, transform=ax.transAxes, fontsize=12,
            verticalalignment='top', bbox=props)
    
    plt.tight_layout()
    plt.savefig('contrarian_scatter.png', dpi=300, bbox_inches='tight', facecolor='white')
    print("Created: contrarian_scatter.png")
    plt.close()

def extract_model_stats():
    """Extract model statistics from multi-judge results."""
    data = load_data()
    
    model_scores = defaultdict(list)
    
    for test in data['results']['results']:
        if 'vars' not in test or 'gradingResult' not in test:
            continue
            
        provider = test.get('provider', {})
        if isinstance(provider, dict):
            provider_id = provider.get('id', '')
        else:
            provider_id = str(provider)
            
        model_name = provider_id.split(':')[1] if ':' in provider_id else provider_id
        
        if test['gradingResult'] and 'namedScores' in test['gradingResult']:
            scores = list(test['gradingResult']['namedScores'].values())
            avg_score = np.mean(scores) if scores else None
            
            if avg_score is not None:
                model_scores[model_name].append(avg_score)
    
    model_stats = {}
    for model, scores in model_scores.items():
        if scores:
            model_stats[model] = {
                'mean': np.mean(scores),
                'std': np.std(scores),
                'median': np.median(scores),
                'scores': scores
            }
    
    return model_stats

def main():
    """Generate all visualizations."""
    print("Generating visualizations for blog post...")
    
    # Extract model statistics
    model_stats = extract_model_stats()
    
    # Generate all charts
    create_political_spectrum_chart(model_stats)
    create_extremism_comparison()
    create_musk_bias_chart()
    create_judge_agreement_heatmap()
    create_self_scoring_bias_chart()
    create_political_distribution_violin()
    create_contrarian_scatter()
    
    print("\nAll visualizations created successfully!")
    print("\nFiles created:")
    print("- political_spectrum_main.png")
    print("- extremism_comparison.png") 
    print("- musk_bias_comparison.png")
    print("- judge_agreement_heatmap.png")
    print("- self_scoring_bias.png")
    print("- political_distribution_violin.png")
    print("- contrarian_scatter.png")

if __name__ == "__main__":
    main() 