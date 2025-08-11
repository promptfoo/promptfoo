import json
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
from collections import defaultdict

# Set style
plt.style.use('seaborn-v0_8-whitegrid')
sns.set_palette("Set2")

def load_data():
    """Load the structured CSV data"""
    df = pd.read_csv('structured_evaluation_data.csv')
    return df

def create_failure_flow_sankey(df):
    """Create a flow diagram showing how failures cascade through categories"""
    import matplotlib.patches as mpatches
    from matplotlib.patches import Rectangle, FancyBboxPatch
    
    fig, ax = plt.subplots(figsize=(14, 10))
    
    # Calculate flows
    failed_df = df[~df['passed']]
    
    # Model to category flows
    model_failures = failed_df.groupby('model').size()
    category_failures = failed_df.groupby('category').size()
    model_category_flows = failed_df.groupby(['model', 'category']).size()
    
    # Define positions
    y_models = np.linspace(0.8, 0.2, len(model_failures))
    y_categories = np.linspace(0.8, 0.2, len(category_failures))
    
    model_positions = {model: y for model, y in zip(model_failures.index, y_models)}
    category_positions = {cat: y for cat, y in zip(category_failures.index, y_categories)}
    
    # Draw model boxes
    for model, count in model_failures.items():
        rect = FancyBboxPatch((0.1, model_positions[model] - 0.03), 0.15, 0.06,
                             boxstyle="round,pad=0.01", 
                             facecolor='lightcoral', edgecolor='black', linewidth=2)
        ax.add_patch(rect)
        ax.text(0.175, model_positions[model], f"{model}\n({count})", 
                ha='center', va='center', fontsize=10, fontweight='bold')
    
    # Draw category boxes
    for cat, count in category_failures.items():
        rect = FancyBboxPatch((0.75, category_positions[cat] - 0.03), 0.15, 0.06,
                             boxstyle="round,pad=0.01",
                             facecolor='lightblue', edgecolor='black', linewidth=2)
        ax.add_patch(rect)
        ax.text(0.825, category_positions[cat], f"{cat}\n({count})", 
                ha='center', va='center', fontsize=10, fontweight='bold')
    
    # Draw flows
    for (model, category), count in model_category_flows.items():
        if count > 2:  # Only show significant flows
            start_y = model_positions[model]
            end_y = category_positions[category]
            
            # Create bezier curve
            path_data = [
                (0.25, start_y),
                (0.4, start_y),
                (0.6, end_y),
                (0.75, end_y)
            ]
            
            codes = [mpatches.Path.MOVETO, mpatches.Path.CURVE4, 
                    mpatches.Path.CURVE4, mpatches.Path.CURVE4]
            
            path = mpatches.Path(path_data, codes)
            patch = mpatches.PathPatch(path, facecolor='none', 
                                     edgecolor='gray', linewidth=count/5, alpha=0.5)
            ax.add_patch(patch)
    
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis('off')
    ax.set_title('Failure Flow: From Models to Categories', fontsize=16, fontweight='bold', pad=20)
    
    # Add legend
    ax.text(0.5, 0.05, 'Line thickness represents failure count', 
            ha='center', fontsize=10, style='italic')
    
    plt.tight_layout()
    plt.savefig('failure_flow_sankey.png', dpi=300, bbox_inches='tight')
    plt.close()

def create_score_distribution_violin(df):
    """Create violin plots for score distributions"""
    # Extract score columns
    score_cols = [col for col in df.columns if col.startswith('score_')]
    
    if not score_cols:
        print("No score columns found for violin plot")
        return
    
    # Melt dataframe for plotting
    score_data = []
    for _, row in df.iterrows():
        for col in score_cols:
            if pd.notna(row[col]):
                score_data.append({
                    'model': row['model'],
                    'score_type': col.replace('score_', ''),
                    'score': row[col],
                    'passed': row['passed']
                })
    
    score_df = pd.DataFrame(score_data)
    
    if len(score_df) == 0:
        print("No score data available for violin plot")
        return
    
    # Create violin plot
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 10))
    
    # Plot 1: Score distribution by model
    if 'model' in score_df.columns and len(score_df['model'].unique()) > 1:
        sns.violinplot(data=score_df, x='model', y='score', ax=ax1, inner='box')
        ax1.set_title('Score Distribution by Model', fontsize=14, fontweight='bold')
        ax1.set_ylabel('Score', fontsize=12)
        ax1.set_xlabel('')
    
    # Plot 2: Score distribution by pass/fail status
    if 'passed' in score_df.columns:
        score_df['status'] = score_df['passed'].map({True: 'Passed', False: 'Failed'})
        sns.violinplot(data=score_df, x='status', y='score', ax=ax2, inner='box')
        ax2.set_title('Score Distribution by Test Outcome', fontsize=14, fontweight='bold')
        ax2.set_ylabel('Score', fontsize=12)
        ax2.set_xlabel('')
    
    plt.tight_layout()
    plt.savefig('score_distribution_violin.png', dpi=300, bbox_inches='tight')
    plt.close()

def create_demographic_correlation_matrix(df):
    """Create correlation matrix of demographic failures"""
    # Create binary matrix of failures by demographic
    failed_df = df[~df['passed'] & (df['demographic'] != 'none')]
    
    # Create pivot table
    demo_model_matrix = pd.crosstab(failed_df['demographic'], failed_df['model'])
    
    # Calculate correlation
    correlation = demo_model_matrix.T.corr()
    
    # Create heatmap
    plt.figure(figsize=(12, 10))
    mask = np.triu(np.ones_like(correlation, dtype=bool))
    
    sns.heatmap(correlation, mask=mask, annot=True, fmt='.2f', 
                cmap='coolwarm', center=0, square=True,
                linewidths=1, cbar_kws={"shrink": .8})
    
    plt.title('Demographic Failure Correlation Matrix', fontsize=16, fontweight='bold')
    plt.tight_layout()
    plt.savefig('demographic_correlation_matrix.png', dpi=300, bbox_inches='tight')
    plt.close()

def create_category_demographic_bubble(df):
    """Create bubble chart showing category-demographic intersections"""
    # Calculate failures by category and demographic
    failed_df = df[~df['passed'] & (df['demographic'] != 'none')]
    cat_demo_counts = failed_df.groupby(['category', 'demographic']).size().reset_index(name='failures')
    
    # Get unique categories and demographics
    categories = cat_demo_counts['category'].unique()
    demographics = cat_demo_counts['demographic'].unique()
    
    # Create bubble chart
    fig, ax = plt.subplots(figsize=(16, 10))
    
    # Create position mappings
    cat_positions = {cat: i for i, cat in enumerate(categories)}
    demo_positions = {demo: i for i, demo in enumerate(demographics)}
    
    # Plot bubbles
    for _, row in cat_demo_counts.iterrows():
        x = cat_positions[row['category']]
        y = demo_positions[row['demographic']]
        size = row['failures'] * 100
        
        ax.scatter(x, y, s=size, alpha=0.6, 
                  c=row['failures'], cmap='Reds', vmin=0, vmax=cat_demo_counts['failures'].max())
        
        # Add text for significant failures
        if row['failures'] > 2:
            ax.text(x, y, str(row['failures']), ha='center', va='center', fontsize=9)
    
    # Set labels
    ax.set_xticks(range(len(categories)))
    ax.set_xticklabels(categories, rotation=45, ha='right')
    ax.set_yticks(range(len(demographics)))
    ax.set_yticklabels(demographics)
    
    ax.set_xlabel('Category', fontsize=12)
    ax.set_ylabel('Demographic', fontsize=12)
    ax.set_title('Intersection of Category and Demographic Failures', fontsize=16, fontweight='bold')
    
    # Add colorbar
    sm = plt.cm.ScalarMappable(cmap='Reds', norm=plt.Normalize(vmin=0, vmax=cat_demo_counts['failures'].max()))
    sm.set_array([])
    cbar = plt.colorbar(sm, ax=ax)
    cbar.set_label('Number of Failures', fontsize=10)
    
    plt.tight_layout()
    plt.savefig('category_demographic_bubble.png', dpi=300, bbox_inches='tight')
    plt.close()

def create_model_performance_timeline(df):
    """Create a timeline showing cumulative performance"""
    # Sort by some order (could be test ID if available)
    df_sorted = df.copy()
    df_sorted['test_index'] = range(len(df_sorted))
    
    # Calculate cumulative pass rate for each model
    fig, ax = plt.subplots(figsize=(14, 8))
    
    models = df_sorted['model'].unique()
    colors = ['#2ecc71', '#3498db', '#f39c12', '#e74c3c']
    
    for idx, model in enumerate(models):
        model_df = df_sorted[df_sorted['model'] == model].sort_values('test_index')
        model_df['cumulative_pass_rate'] = model_df['passed'].expanding().mean() * 100
        
        ax.plot(model_df['test_index'], model_df['cumulative_pass_rate'], 
               label=model, color=colors[idx], linewidth=2)
    
    ax.axhline(y=50, color='black', linestyle='--', alpha=0.5, label='50% threshold')
    ax.set_xlabel('Test Number', fontsize=12)
    ax.set_ylabel('Cumulative Pass Rate (%)', fontsize=12)
    ax.set_title('Model Performance Over Test Sequence', fontsize=16, fontweight='bold')
    ax.legend()
    ax.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig('model_performance_timeline.png', dpi=300, bbox_inches='tight')
    plt.close()

def create_failure_reason_network(df):
    """Create network visualization of failure reasons"""
    import networkx as nx
    from collections import Counter
    
    # Extract failure reasons and their relationships
    failed_df = df[~df['passed'] & df['has_error']]
    
    # Create co-occurrence matrix
    keyword_pairs = []
    keywords = ['assumptions', 'stereotype', 'demographic', 'gender', 'race', 
                'capabilities', 'preferences', 'tailored', 'specific']
    
    for error in failed_df['error']:
        if error:
            error_lower = error.lower()
            found_keywords = [kw for kw in keywords if kw in error_lower]
            
            # Create pairs
            for i in range(len(found_keywords)):
                for j in range(i+1, len(found_keywords)):
                    keyword_pairs.append((found_keywords[i], found_keywords[j]))
    
    # Count co-occurrences
    pair_counts = Counter(keyword_pairs)
    
    # Create network
    G = nx.Graph()
    
    # Add edges with weights
    for (kw1, kw2), count in pair_counts.items():
        if count > 2:  # Only show significant relationships
            G.add_edge(kw1, kw2, weight=count)
    
    # Create visualization
    fig, ax = plt.subplots(figsize=(12, 10))
    
    pos = nx.spring_layout(G, k=2, iterations=50)
    
    # Draw nodes
    node_sizes = [G.degree(node) * 500 for node in G.nodes()]
    nx.draw_networkx_nodes(G, pos, node_size=node_sizes, node_color='lightblue', 
                          edgecolors='black', linewidths=2, ax=ax)
    
    # Draw edges
    edges = G.edges()
    weights = [G[u][v]['weight'] for u, v in edges]
    nx.draw_networkx_edges(G, pos, width=[w/2 for w in weights], alpha=0.5, ax=ax)
    
    # Draw labels
    nx.draw_networkx_labels(G, pos, font_size=12, font_weight='bold', ax=ax)
    
    ax.set_title('Failure Reason Keyword Network', fontsize=16, fontweight='bold')
    ax.axis('off')
    
    plt.tight_layout()
    plt.savefig('failure_reason_network.png', dpi=300, bbox_inches='tight')
    plt.close()

def create_comprehensive_report_figure(df):
    """Create a comprehensive single-page report figure"""
    fig = plt.figure(figsize=(20, 24))
    
    # Calculate key metrics
    total_tests = len(df)
    overall_pass_rate = df['passed'].mean() * 100
    overall_fail_rate = 100 - overall_pass_rate
    
    # Model stats
    model_stats = df.groupby('model')['passed'].agg(['count', 'mean'])
    model_stats['fail_rate'] = (1 - model_stats['mean']) * 100
    
    # Create grid
    gs = fig.add_gridspec(6, 3, hspace=0.4, wspace=0.3)
    
    # Title
    fig.suptitle('Comprehensive AI Fairness Evaluation Report', fontsize=24, fontweight='bold', y=0.98)
    
    # 1. Key Metrics (top row)
    ax_metrics = fig.add_subplot(gs[0, :])
    ax_metrics.text(0.2, 0.5, f'Total Tests\n{total_tests}', fontsize=20, ha='center', va='center',
                   bbox=dict(boxstyle="round,pad=0.5", facecolor='lightblue'))
    ax_metrics.text(0.5, 0.5, f'Overall Failure Rate\n{overall_fail_rate:.1f}%', fontsize=20, ha='center', va='center',
                   bbox=dict(boxstyle="round,pad=0.5", facecolor='lightcoral'))
    ax_metrics.text(0.8, 0.5, f'Models Tested\n{len(model_stats)}', fontsize=20, ha='center', va='center',
                   bbox=dict(boxstyle="round,pad=0.5", facecolor='lightgreen'))
    ax_metrics.set_xlim(0, 1)
    ax_metrics.set_ylim(0, 1)
    ax_metrics.axis('off')
    
    # 2. Model Performance Bar Chart
    ax_models = fig.add_subplot(gs[1, :2])
    models = model_stats.index
    fail_rates = model_stats['fail_rate']
    colors = ['#2ecc71', '#3498db', '#f39c12', '#e74c3c']
    
    bars = ax_models.bar(models, fail_rates, color=colors)
    for bar, rate in zip(bars, fail_rates):
        ax_models.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 1,
                      f'{rate:.1f}%', ha='center', va='bottom', fontweight='bold')
    
    ax_models.set_ylabel('Failure Rate (%)', fontsize=12)
    ax_models.set_title('Model Failure Rates', fontsize=16, fontweight='bold')
    ax_models.set_ylim(0, 80)
    ax_models.axhline(y=50, color='red', linestyle='--', alpha=0.5)
    
    # 3. Category Performance
    ax_categories = fig.add_subplot(gs[1, 2])
    category_stats = df.groupby('category')['passed'].mean()
    category_fail_rates = (1 - category_stats) * 100
    category_fail_rates = category_fail_rates.sort_values(ascending=False)[:5]
    
    ax_categories.barh(category_fail_rates.index, category_fail_rates.values, color='coral')
    ax_categories.set_xlabel('Failure Rate (%)', fontsize=12)
    ax_categories.set_title('Top 5 Failing Categories', fontsize=16, fontweight='bold')
    
    # 4. Demographic Impact
    ax_demo = fig.add_subplot(gs[2, :])
    failed_df = df[~df['passed'] & (df['demographic'] != 'none')]
    demo_counts = failed_df['demographic'].value_counts().head(10)
    
    bars = ax_demo.bar(range(len(demo_counts)), demo_counts.values, color='#e74c3c')
    ax_demo.set_xticks(range(len(demo_counts)))
    ax_demo.set_xticklabels(demo_counts.index, rotation=45, ha='right')
    ax_demo.set_ylabel('Number of Failures', fontsize=12)
    ax_demo.set_title('Top 10 Most Affected Demographics', fontsize=16, fontweight='bold')
    
    for i, (bar, count) in enumerate(zip(bars, demo_counts.values)):
        ax_demo.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.5,
                    str(count), ha='center', va='bottom', fontweight='bold')
    
    # 5. Test Type Analysis
    ax_test_type = fig.add_subplot(gs[3, :2])
    test_type_stats = df.groupby('test_type')['passed'].mean() * 100
    test_type_stats.plot(kind='bar', ax=ax_test_type, color='skyblue')
    ax_test_type.set_ylabel('Pass Rate (%)', fontsize=12)
    ax_test_type.set_title('Performance by Test Type', fontsize=16, fontweight='bold')
    ax_test_type.set_xticklabels(ax_test_type.get_xticklabels(), rotation=45)
    
    # 6. Key Findings Text
    ax_findings = fig.add_subplot(gs[3, 2])
    findings_text = """KEY FINDINGS:
    
• All models show significant bias
  (>45% failure rate)
  
• "Anti-woke" Grok-4 performs worst
  
• Native Americans most affected
  (30 failures)
  
• Education & Marketing categories
  have highest bias rates
  
• Control questions also show bias,
  indicating deep-seated issues"""
    
    ax_findings.text(0.1, 0.9, findings_text, fontsize=11, va='top', 
                    bbox=dict(boxstyle="round,pad=0.5", facecolor='lightyellow'))
    ax_findings.set_xlim(0, 1)
    ax_findings.set_ylim(0, 1)
    ax_findings.axis('off')
    
    # 7. Failure Pattern Analysis
    ax_patterns = fig.add_subplot(gs[4, :])
    
    # Count failure patterns
    failure_patterns = defaultdict(int)
    for error in failed_df['error']:
        if error:
            if 'assumptions' in error.lower():
                failure_patterns['Makes Assumptions'] += 1
            if 'stereotype' in error.lower():
                failure_patterns['Stereotyping'] += 1
            if 'demographic' in error.lower():
                failure_patterns['Demographic Bias'] += 1
            if 'tailored' in error.lower() or 'specific' in error.lower():
                failure_patterns['Over-tailoring'] += 1
    
    patterns = sorted(failure_patterns.items(), key=lambda x: x[1], reverse=True)
    if patterns:
        labels, counts = zip(*patterns)
        ax_patterns.pie(counts, labels=labels, autopct='%1.1f%%', startangle=90)
        ax_patterns.set_title('Failure Pattern Distribution', fontsize=16, fontweight='bold')
    
    # 8. Recommendations
    ax_rec = fig.add_subplot(gs[5, :])
    recommendations = """RECOMMENDATIONS:
    
    1. Mandate comprehensive bias testing before AI deployment in government systems
    
    2. Focus on improving AI awareness of bias rather than preventing it
    
    3. Implement specific protections for highly affected groups (Native Americans, Hispanic/Latino, etc.)
    
    4. Prioritize bias mitigation in Education and Marketing applications
    
    5. Use evidence-based metrics rather than ideological positioning for AI evaluation"""
    
    ax_rec.text(0.5, 0.5, recommendations, fontsize=12, ha='center', va='center',
               bbox=dict(boxstyle="round,pad=1", facecolor='lightgreen', alpha=0.7))
    ax_rec.set_xlim(0, 1)
    ax_rec.set_ylim(0, 1)
    ax_rec.axis('off')
    
    plt.savefig('comprehensive_report.png', dpi=300, bbox_inches='tight')
    plt.close()

def main():
    print("Loading data...")
    df = load_data()
    
    print("\nCreating advanced visualizations...")
    
    print("1. Creating failure flow diagram...")
    create_failure_flow_sankey(df)
    
    print("2. Creating score distribution violin plots...")
    create_score_distribution_violin(df)
    
    print("3. Creating demographic correlation matrix...")
    create_demographic_correlation_matrix(df)
    
    print("4. Creating category-demographic bubble chart...")
    create_category_demographic_bubble(df)
    
    print("5. Creating model performance timeline...")
    create_model_performance_timeline(df)
    
    print("6. Creating failure reason network...")
    try:
        create_failure_reason_network(df)
    except ImportError:
        print("   NetworkX not available, skipping network visualization")
    
    print("7. Creating comprehensive report figure...")
    create_comprehensive_report_figure(df)
    
    print("\nAll advanced visualizations created successfully!")
    print("\nNew files generated:")
    print("- failure_flow_sankey.png")
    print("- score_distribution_violin.png")
    print("- demographic_correlation_matrix.png")
    print("- category_demographic_bubble.png")
    print("- model_performance_timeline.png")
    print("- failure_reason_network.png")
    print("- comprehensive_report.png")

if __name__ == "__main__":
    main()
