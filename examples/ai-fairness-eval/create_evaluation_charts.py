import json
import matplotlib.pyplot as plt
import numpy as np
from collections import defaultdict

def load_results(filepath='results/political_bias_models_8k_eval.json'):
    with open(filepath, 'r') as f:
        return json.load(f)

def create_visualizations():
    data = load_results()
    results = data['results']['results']
    
    # Calculate model performance
    model_stats = defaultdict(lambda: {'passed': 0, 'failed': 0})
    category_stats = defaultdict(lambda: {'passed': 0, 'failed': 0})
    demographic_stats = defaultdict(int)
    
    for result in results:
        if not isinstance(result, dict):
            continue
            
        # Extract metadata
        vars_data = result.get('vars', {})
        category = vars_data.get('category', 'unknown')
        demographic = vars_data.get('demographics', vars_data.get('demographic', 'none'))
        
        # Determine status
        grading_result = result.get('gradingResult', {})
        passed = grading_result.get('pass', False)
        
        # Get model
        provider = result.get('provider', {})
        model_label = provider.get('label', 'Unknown') if isinstance(provider, dict) else str(provider)
        
        # Update stats
        if passed:
            model_stats[model_label]['passed'] += 1
            category_stats[category]['passed'] += 1
        else:
            model_stats[model_label]['failed'] += 1
            category_stats[category]['failed'] += 1
            if demographic != 'none':
                demographic_stats[demographic] += 1
    
    # Create Model Performance Chart
    plt.figure(figsize=(10, 6))
    models = ['GPT-4.1', 'Claude Opus 4', 'Gemini 2.5 Pro', 'Grok-4']
    pass_rates = []
    for model in models:
        total = model_stats[model]['passed'] + model_stats[model]['failed']
        pass_rate = (model_stats[model]['passed'] / total * 100) if total > 0 else 0
        pass_rates.append(pass_rate)
    
    colors = ['#2ecc71', '#3498db', '#f39c12', '#e74c3c']
    bars = plt.bar(models, pass_rates, color=colors)
    
    # Add value labels on bars
    for bar, rate in zip(bars, pass_rates):
        plt.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 1, 
                f'{rate:.1f}%', ha='center', va='bottom', fontsize=12, fontweight='bold')
    
    plt.axhline(y=50, color='black', linestyle='--', alpha=0.5, label='50% threshold')
    plt.ylabel('Pass Rate (%)', fontsize=14)
    plt.title('AI Model Performance on Fairness Tests', fontsize=16, fontweight='bold')
    plt.ylim(0, 70)
    plt.tight_layout()
    plt.savefig('model_performance_chart.png', dpi=300, bbox_inches='tight')
    plt.close()
    
    # Create Demographic Impact Chart
    plt.figure(figsize=(12, 8))
    demographics = sorted(demographic_stats.items(), key=lambda x: x[1], reverse=True)[:10]
    demo_names = [d[0] for d in demographics]
    demo_counts = [d[1] for d in demographics]
    
    # Shorten long demographic names
    demo_names_short = []
    for name in demo_names:
        if 'middle-aged adults' in name:
            demo_names_short.append('Middle-aged (46-65)')
        elif 'young adults' in name:
            demo_names_short.append('Young adults (18-25)')
        elif 'seniors' in name:
            demo_names_short.append('Seniors (65+)')
        elif 'adults (26-45)' in name:
            demo_names_short.append('Adults (26-45)')
        else:
            demo_names_short.append(name.title())
    
    bars = plt.barh(demo_names_short, demo_counts, color='#e74c3c')
    
    # Add value labels
    for bar, count in zip(bars, demo_counts):
        plt.text(bar.get_width() + 0.5, bar.get_y() + bar.get_height()/2, 
                str(count), va='center', ha='left', fontsize=11, fontweight='bold')
    
    plt.xlabel('Number of Test Failures', fontsize=14)
    plt.title('Demographic Groups Most Affected by AI Bias', fontsize=16, fontweight='bold')
    plt.tight_layout()
    plt.savefig('demographic_impact_chart.png', dpi=300, bbox_inches='tight')
    plt.close()
    
    # Create Category Performance Chart
    plt.figure(figsize=(10, 6))
    categories = ['Education', 'Marketing', 'Healthcare', 'Employment', 'Service']
    failure_rates = []
    
    for cat in categories:
        cat_lower = cat.lower()
        total = category_stats[cat_lower]['passed'] + category_stats[cat_lower]['failed']
        if total > 0:
            failure_rate = category_stats[cat_lower]['failed'] / total * 100
        else:
            failure_rate = 0
        failure_rates.append(failure_rate)
    
    bars = plt.bar(categories, failure_rates, color=['#e74c3c', '#d35400', '#f39c12', '#27ae60', '#2ecc71'])
    
    # Add value labels
    for bar, rate in zip(bars, failure_rates):
        plt.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 1, 
                f'{rate:.1f}%', ha='center', va='bottom', fontsize=12, fontweight='bold')
    
    plt.ylabel('Failure Rate (%)', fontsize=14)
    plt.title('AI Bias by Category', fontsize=16, fontweight='bold')
    plt.ylim(0, 80)
    plt.tight_layout()
    plt.savefig('category_bias_chart.png', dpi=300, bbox_inches='tight')
    plt.close()
    
    print("Charts created successfully!")
    print("- model_performance_chart.png: Shows pass rates for each model")
    print("- demographic_impact_chart.png: Shows which demographics face most bias")
    print("- category_bias_chart.png: Shows bias levels by content category")

if __name__ == "__main__":
    create_visualizations()
