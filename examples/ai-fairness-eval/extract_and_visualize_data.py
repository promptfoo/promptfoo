import json
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
from collections import defaultdict
import textwrap

# Set style
plt.style.use('seaborn-v0_8-darkgrid')
sns.set_palette("husl")

def load_and_structure_data(filepath='results/political_bias_models_8k_eval.json'):
    """Load JSON and structure into DataFrame"""
    with open(filepath, 'r') as f:
        data = json.load(f)
    
    # Extract all results into structured format
    structured_data = []
    
    for result in data['results']['results']:
        if not isinstance(result, dict):
            continue
            
        # Extract metadata
        vars_data = result.get('vars', {})
        grading_result = result.get('gradingResult', {})
        provider = result.get('provider', {})
        
        # Structure the record
        record = {
            'model': provider.get('label', 'Unknown') if isinstance(provider, dict) else str(provider),
            'category': vars_data.get('category', 'unknown'),
            'subcategory': vars_data.get('subcategory', 'unknown'),
            'demographic': vars_data.get('demographics', vars_data.get('demographic', 'none')),
            'test_type': vars_data.get('test_type', 'unknown'),
            'prompt': vars_data.get('prompt', ''),
            'passed': grading_result.get('pass', False),
            'error': result.get('error', ''),
            'has_error': bool(result.get('error'))
        }
        
        # Extract scores if available
        if grading_result and 'score' in grading_result:
            score = grading_result['score']
            if isinstance(score, dict):
                for key, value in score.items():
                    record[f'score_{key}'] = value
            elif isinstance(score, (int, float)):
                record['score_overall'] = score
        
        structured_data.append(record)
    
    df = pd.DataFrame(structured_data)
    
    # Save structured data
    df.to_csv('structured_evaluation_data.csv', index=False)
    print(f"Saved structured data to CSV: {len(df)} records")
    
    return df

def create_heatmap_model_category(df):
    """Create heatmap of model performance by category"""
    # Calculate failure rates
    pivot_data = df.groupby(['model', 'category']).agg({
        'passed': lambda x: (1 - x.mean()) * 100  # Convert to failure rate
    }).reset_index()
    
    pivot_table = pivot_data.pivot(index='model', columns='category', values='passed')
    
    plt.figure(figsize=(12, 8))
    sns.heatmap(pivot_table, annot=True, fmt='.1f', cmap='RdYlGn_r', 
                cbar_kws={'label': 'Failure Rate (%)'}, vmin=0, vmax=100)
    plt.title('AI Model Failure Rates by Category', fontsize=16, fontweight='bold')
    plt.xlabel('Category', fontsize=12)
    plt.ylabel('Model', fontsize=12)
    plt.tight_layout()
    plt.savefig('heatmap_model_category.png', dpi=300, bbox_inches='tight')
    plt.close()

def create_demographic_distribution(df):
    """Create distribution of failures by demographic"""
    # Filter failed tests with demographics
    failed_df = df[(~df['passed']) & (df['demographic'] != 'none')]
    
    # Count by demographic and model
    demo_counts = failed_df.groupby(['demographic', 'model']).size().reset_index(name='count')
    
    # Create stacked bar chart
    plt.figure(figsize=(14, 8))
    
    # Pivot for stacking
    pivot = demo_counts.pivot(index='demographic', columns='model', values='count').fillna(0)
    
    # Sort by total failures
    pivot['total'] = pivot.sum(axis=1)
    pivot = pivot.sort_values('total', ascending=True).drop('total', axis=1)
    
    # Create horizontal stacked bar
    pivot.plot(kind='barh', stacked=True, figsize=(14, 8), width=0.8)
    
    plt.xlabel('Number of Failures', fontsize=12)
    plt.title('Demographic Bias Distribution Across Models', fontsize=16, fontweight='bold')
    plt.legend(title='Model', bbox_to_anchor=(1.05, 1), loc='upper left')
    plt.tight_layout()
    plt.savefig('demographic_distribution_stacked.png', dpi=300, bbox_inches='tight')
    plt.close()

def create_test_type_analysis(df):
    """Analyze performance by test type"""
    # Calculate pass rates by test type and model
    test_type_stats = df.groupby(['test_type', 'model']).agg({
        'passed': 'mean'
    }).reset_index()
    test_type_stats['pass_rate'] = test_type_stats['passed'] * 100
    
    # Create grouped bar chart
    plt.figure(figsize=(12, 6))
    
    # Pivot for plotting
    pivot = test_type_stats.pivot(index='test_type', columns='model', values='pass_rate')
    
    ax = pivot.plot(kind='bar', width=0.8, figsize=(12, 6))
    plt.ylabel('Pass Rate (%)', fontsize=12)
    plt.xlabel('Test Type', fontsize=12)
    plt.title('Model Performance by Test Type', fontsize=16, fontweight='bold')
    plt.xticks(rotation=45)
    plt.legend(title='Model', bbox_to_anchor=(1.05, 1), loc='upper left')
    plt.ylim(0, 100)
    
    # Add value labels
    for container in ax.containers:
        ax.bar_label(container, fmt='%.1f', padding=3)
    
    plt.tight_layout()
    plt.savefig('test_type_performance.png', dpi=300, bbox_inches='tight')
    plt.close()

def create_failure_reasons_wordcloud(df):
    """Analyze common failure reasons"""
    from collections import Counter
    import re
    
    # Get all failure reasons
    failed_df = df[~df['passed'] & df['has_error']]
    
    # Extract key phrases from error messages
    failure_patterns = defaultdict(int)
    
    for error in failed_df['error']:
        if error:
            # Extract key phrases
            if 'assumptions about' in error.lower():
                failure_patterns['Makes assumptions'] += 1
            if 'stereotype' in error.lower():
                failure_patterns['Stereotyping'] += 1
            if 'demographic' in error.lower():
                failure_patterns['Demographic bias'] += 1
            if 'gender' in error.lower():
                failure_patterns['Gender bias'] += 1
            if 'race' in error.lower() or 'racial' in error.lower():
                failure_patterns['Racial bias'] += 1
            if 'tailored' in error.lower() or 'specific' in error.lower():
                failure_patterns['Over-tailoring'] += 1
            if 'capabilities' in error.lower():
                failure_patterns['Capability assumptions'] += 1
            if 'preferences' in error.lower():
                failure_patterns['Preference assumptions'] += 1
    
    # Create bar chart of failure patterns
    plt.figure(figsize=(10, 6))
    patterns = sorted(failure_patterns.items(), key=lambda x: x[1], reverse=True)[:10]
    labels, counts = zip(*patterns)
    
    bars = plt.bar(range(len(labels)), counts, color='#e74c3c')
    plt.xticks(range(len(labels)), labels, rotation=45, ha='right')
    plt.ylabel('Frequency', fontsize=12)
    plt.title('Common Failure Patterns in AI Responses', fontsize=16, fontweight='bold')
    
    # Add value labels
    for bar, count in zip(bars, counts):
        plt.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 1, 
                str(count), ha='center', va='bottom', fontweight='bold')
    
    plt.tight_layout()
    plt.savefig('failure_patterns.png', dpi=300, bbox_inches='tight')
    plt.close()

def create_model_comparison_radar(df):
    """Create radar chart comparing models across categories"""
    # Calculate pass rates by model and category
    model_category_stats = df.groupby(['model', 'category']).agg({
        'passed': 'mean'
    }).reset_index()
    
    # Pivot for radar chart
    pivot = model_category_stats.pivot(index='category', columns='model', values='passed') * 100
    
    # Select main categories
    main_categories = ['adversarial', 'education', 'employment', 'healthcare', 'marketing']
    pivot = pivot.loc[pivot.index.isin(main_categories)]
    
    # Create radar chart
    categories = list(pivot.index)
    models = list(pivot.columns)
    
    angles = np.linspace(0, 2 * np.pi, len(categories), endpoint=False).tolist()
    angles += angles[:1]  # Complete the circle
    
    fig, ax = plt.subplots(figsize=(10, 10), subplot_kw=dict(projection='polar'))
    
    colors = ['#2ecc71', '#3498db', '#f39c12', '#e74c3c']
    
    for idx, model in enumerate(models):
        values = pivot[model].tolist()
        values += values[:1]  # Complete the circle
        
        ax.plot(angles, values, 'o-', linewidth=2, label=model, color=colors[idx])
        ax.fill(angles, values, alpha=0.15, color=colors[idx])
    
    ax.set_theta_offset(np.pi / 2)
    ax.set_theta_direction(-1)
    ax.set_xticks(angles[:-1])
    ax.set_xticklabels([cat.title() for cat in categories], size=12)
    ax.set_ylim(0, 100)
    ax.set_ylabel('Pass Rate (%)', labelpad=30)
    ax.set_title('Model Performance Across Categories', size=16, fontweight='bold', pad=30)
    ax.legend(loc='upper right', bbox_to_anchor=(1.2, 1.1))
    ax.grid(True)
    
    plt.tight_layout()
    plt.savefig('model_comparison_radar.png', dpi=300, bbox_inches='tight')
    plt.close()

def create_demographic_model_scatter(df):
    """Create scatter plot of demographic failures by model"""
    # Count failures by demographic and model
    failed_df = df[(~df['passed']) & (df['demographic'] != 'none')]
    demo_model_counts = failed_df.groupby(['demographic', 'model']).size().reset_index(name='failures')
    
    # Create scatter plot with jitter
    plt.figure(figsize=(14, 10))
    
    models = demo_model_counts['model'].unique()
    colors = ['#2ecc71', '#3498db', '#f39c12', '#e74c3c']
    
    for idx, model in enumerate(models):
        model_data = demo_model_counts[demo_model_counts['model'] == model]
        
        # Add jitter to x-axis for visibility
        x_positions = [idx + np.random.uniform(-0.1, 0.1) for _ in range(len(model_data))]
        
        plt.scatter(x_positions, model_data['failures'], 
                   s=200, alpha=0.6, color=colors[idx], label=model)
        
        # Add demographic labels
        for x, y, demo in zip(x_positions, model_data['failures'], model_data['demographic']):
            if y > 5:  # Only label high-failure demographics
                plt.annotate(demo, (x, y), fontsize=8, ha='center', va='bottom')
    
    plt.xticks(range(len(models)), models, fontsize=12)
    plt.ylabel('Number of Failures', fontsize=12)
    plt.title('Demographic Failures Distribution by Model', fontsize=16, fontweight='bold')
    plt.legend()
    plt.grid(axis='y', alpha=0.3)
    plt.tight_layout()
    plt.savefig('demographic_model_scatter.png', dpi=300, bbox_inches='tight')
    plt.close()

def create_summary_dashboard(df):
    """Create a summary dashboard with key metrics"""
    fig = plt.figure(figsize=(16, 10))
    
    # Overall metrics
    total_tests = len(df)
    overall_pass_rate = df['passed'].mean() * 100
    
    # Model performance
    model_stats = df.groupby('model').agg({
        'passed': ['count', 'mean']
    }).round(3)
    
    # Create subplots
    gs = fig.add_gridspec(3, 3, hspace=0.3, wspace=0.3)
    
    # 1. Overall metrics (top-left)
    ax1 = fig.add_subplot(gs[0, 0])
    ax1.text(0.5, 0.7, f'Total Tests: {total_tests}', fontsize=20, ha='center', fontweight='bold')
    ax1.text(0.5, 0.3, f'Pass Rate: {overall_pass_rate:.1f}%', fontsize=18, ha='center', 
             color='red' if overall_pass_rate < 50 else 'green')
    ax1.set_xlim(0, 1)
    ax1.set_ylim(0, 1)
    ax1.axis('off')
    ax1.set_title('Overall Performance', fontsize=16, fontweight='bold')
    
    # 2. Model ranking (top-middle and top-right)
    ax2 = fig.add_subplot(gs[0, 1:])
    models = model_stats.index
    pass_rates = model_stats[('passed', 'mean')] * 100
    
    bars = ax2.barh(models, pass_rates, color=['#2ecc71', '#3498db', '#f39c12', '#e74c3c'])
    
    # Add value labels
    for bar, rate in zip(bars, pass_rates):
        ax2.text(bar.get_width() + 1, bar.get_y() + bar.get_height()/2, 
                f'{rate:.1f}%', va='center', fontweight='bold')
    
    ax2.set_xlabel('Pass Rate (%)', fontsize=12)
    ax2.set_title('Model Rankings', fontsize=16, fontweight='bold')
    ax2.set_xlim(0, 70)
    
    # 3. Category performance (middle row)
    ax3 = fig.add_subplot(gs[1, :])
    category_stats = df.groupby('category')['passed'].mean() * 100
    category_stats = category_stats.sort_values()
    
    bars = ax3.bar(category_stats.index, category_stats.values, 
                   color=plt.cm.RdYlGn(category_stats.values/100))
    
    # Add value labels
    for bar, rate in zip(bars, category_stats.values):
        ax3.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 1, 
                f'{rate:.1f}%', ha='center', va='bottom', fontweight='bold')
    
    ax3.set_ylabel('Pass Rate (%)', fontsize=12)
    ax3.set_title('Performance by Category', fontsize=16, fontweight='bold')
    ax3.set_ylim(0, 100)
    plt.setp(ax3.xaxis.get_majorticklabels(), rotation=45, ha='right')
    
    # 4. Top affected demographics (bottom row)
    ax4 = fig.add_subplot(gs[2, :])
    failed_df = df[(~df['passed']) & (df['demographic'] != 'none')]
    demo_counts = failed_df['demographic'].value_counts().head(10)
    
    bars = ax4.barh(demo_counts.index[::-1], demo_counts.values[::-1], color='#e74c3c')
    
    # Add value labels
    for bar, count in zip(bars, demo_counts.values[::-1]):
        ax4.text(bar.get_width() + 0.5, bar.get_y() + bar.get_height()/2, 
                str(count), va='center', fontweight='bold')
    
    ax4.set_xlabel('Number of Failures', fontsize=12)
    ax4.set_title('Most Affected Demographics', fontsize=16, fontweight='bold')
    
    plt.suptitle('AI Fairness Evaluation Summary Dashboard', fontsize=20, fontweight='bold')
    plt.tight_layout()
    plt.savefig('summary_dashboard.png', dpi=300, bbox_inches='tight')
    plt.close()

def main():
    print("Loading and structuring data...")
    df = load_and_structure_data()
    
    print("\nCreating visualizations...")
    
    print("1. Creating model-category heatmap...")
    create_heatmap_model_category(df)
    
    print("2. Creating demographic distribution chart...")
    create_demographic_distribution(df)
    
    print("3. Creating test type analysis...")
    create_test_type_analysis(df)
    
    print("4. Creating failure patterns analysis...")
    create_failure_reasons_wordcloud(df)
    
    print("5. Creating model comparison radar chart...")
    create_model_comparison_radar(df)
    
    print("6. Creating demographic-model scatter plot...")
    create_demographic_model_scatter(df)
    
    print("7. Creating summary dashboard...")
    create_summary_dashboard(df)
    
    print("\nAll visualizations created successfully!")
    print("\nGenerated files:")
    print("- structured_evaluation_data.csv")
    print("- heatmap_model_category.png")
    print("- demographic_distribution_stacked.png")
    print("- test_type_performance.png")
    print("- failure_patterns.png")
    print("- model_comparison_radar.png")
    print("- demographic_model_scatter.png")
    print("- summary_dashboard.png")

if __name__ == "__main__":
    main()
