#!/usr/bin/env python3
"""
Create rigorous, professional charts for AI bias evaluation article
Removing sensationalistic language and ensuring data accuracy
"""

import matplotlib.pyplot as plt
import numpy as np

def create_primary_findings_chart():
    """Create a clean chart showing the primary findings"""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 8))
    
    # Left panel: Uncertainty acknowledgment change
    models = ['GPT-3.5-turbo\n(March 2023)', 'GPT-5-nano\n(August 2025)']
    unknown_rates = [13.1, 29.9]
    colors = ['#E63946', '#06D6A0']
    
    bars1 = ax1.bar(models, unknown_rates, color=colors, alpha=0.8, edgecolor='black', linewidth=1.5)
    
    # Add value labels
    for i, (bar, rate) in enumerate(zip(bars1, unknown_rates)):
        ax1.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 1, 
                f'{rate}%', ha='center', va='bottom', fontweight='bold', fontsize=12)
    
    # Add difference annotation
    ax1.annotate('', xy=(1, 29.9), xytext=(0, 13.1),
                arrowprops=dict(arrowstyle='<->', color='blue', lw=2))
    ax1.text(0.5, 21.5, '+16.8\npercentage\npoints', ha='center', va='center',
             fontweight='bold', fontsize=11, color='blue',
             bbox=dict(boxstyle="round,pad=0.3", facecolor='lightblue', alpha=0.8))
    
    ax1.set_ylabel('Uncertainty Acknowledgment Rate (%)', fontsize=12, fontweight='bold')
    ax1.set_title('Ambiguous Context Behavior\n"Unknown" Selection Rate', fontsize=14, fontweight='bold')
    ax1.set_ylim(0, 35)
    ax1.grid(axis='y', alpha=0.3)
    
    # Right panel: Overall accuracy comparison  
    overall_rates = [53.0, 61.2]
    bars2 = ax2.bar(models, overall_rates, color=colors, alpha=0.8, edgecolor='black', linewidth=1.5)
    
    for i, (bar, rate) in enumerate(zip(bars2, overall_rates)):
        ax2.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.5, 
                f'{rate}%', ha='center', va='bottom', fontweight='bold', fontsize=12)
    
    ax2.annotate('', xy=(1, 61.2), xytext=(0, 53.0),
                arrowprops=dict(arrowstyle='<->', color='green', lw=2))
    ax2.text(0.5, 57.1, '+8.2\npercentage\npoints', ha='center', va='center',
             fontweight='bold', fontsize=11, color='green',
             bbox=dict(boxstyle="round,pad=0.3", facecolor='lightgreen', alpha=0.8))
    
    ax2.set_ylabel('Overall Accuracy Rate (%)', fontsize=12, fontweight='bold')
    ax2.set_title('Overall Performance\nCombined Accuracy', fontsize=14, fontweight='bold')
    ax2.set_ylim(45, 65)
    ax2.grid(axis='y', alpha=0.3)
    
    plt.suptitle('AI Bias Evaluation: Key Behavioral Changes\nGPT-3.5-turbo to GPT-5-nano (116,972 tests)', 
                 fontsize=16, fontweight='bold', y=0.98)
    
    plt.tight_layout()
    plt.savefig('/Users/mdangelo/projects/pf2/site/static/img/blog/bbq-bias/primary-findings-rigorous.png', 
                dpi=300, bbox_inches='tight', facecolor='white')
    plt.close()

def create_development_timeline_chart():
    """Create a clean timeline chart without sensationalistic framing"""
    fig, ax = plt.subplots(1, 1, figsize=(14, 8))
    
    # Data points
    models = ['GPT-3.5-turbo', 'GPT-5-nano']
    overall_accuracy = [53.0, 61.2]
    ambiguous_unknown = [13.1, 29.9]
    
    x_pos = [0, 1]
    width = 0.35
    
    # Create bars
    bars1 = ax.bar([p - width/2 for p in x_pos], overall_accuracy, width, 
                   label='Overall Accuracy', color='#2E86AB', alpha=0.8)
    bars2 = ax.bar([p + width/2 for p in x_pos], ambiguous_unknown, width,
                   label='Uncertainty Acknowledgment\n(Ambiguous Contexts)', color='#A23B72', alpha=0.8)
    
    # Add value labels
    for bars in [bars1, bars2]:
        for bar in bars:
            height = bar.get_height()
            ax.text(bar.get_x() + bar.get_width()/2., height + 0.5,
                   f'{height}%', ha='center', va='bottom', fontweight='bold')
    
    ax.set_ylabel('Performance Rate (%)', fontsize=12, fontweight='bold')
    ax.set_xlabel('Model (Release Date)', fontsize=12, fontweight='bold')
    ax.set_title('AI Bias Evolution: 2.5 Years of Development\nMarch 2023 to August 2025', 
                 fontsize=16, fontweight='bold')
    
    ax.set_xticks(x_pos)
    ax.set_xticklabels(['GPT-3.5-turbo\n(March 1, 2023)', 'GPT-5-nano\n(August 7, 2025)'])
    ax.legend(loc='upper left', fontsize=11)
    ax.grid(axis='y', alpha=0.3)
    ax.set_ylim(0, 70)
    
    # Add timeline context
    ax.text(0.5, 65, '2 years, 5 months of development', ha='center', va='center',
            fontsize=12, style='italic', 
            bbox=dict(boxstyle="round,pad=0.5", facecolor='lightyellow', alpha=0.8))
    
    plt.tight_layout()
    plt.savefig('/Users/mdangelo/projects/pf2/site/static/img/blog/bbq-bias/development-timeline-rigorous.png', 
                dpi=300, bbox_inches='tight', facecolor='white')
    plt.close()

def create_methodology_accessibility_chart():
    """Create honest chart about methodology accessibility without inflated comparisons"""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 8))
    
    # Left panel: Cost breakdown
    components = ['GPT-3.5-turbo\n(7.81M tokens)', 'GPT-5-nano\n(22.09M tokens)', 'Total Cost']
    costs = [3.96, 6.16, 10.13]
    colors = ['#E63946', '#06D6A0', '#2E86AB']
    
    bars = ax1.bar(components, costs, color=colors, alpha=0.8, edgecolor='black', linewidth=1)
    
    for bar, cost in zip(bars, costs):
        ax1.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.1, 
                f'${cost}', ha='center', va='bottom', fontweight='bold', fontsize=12)
    
    ax1.set_ylabel('Cost (USD)', fontsize=12, fontweight='bold')
    ax1.set_title('Evaluation Cost Breakdown\n116,972 Total Tests', fontsize=14, fontweight='bold')
    ax1.set_ylim(0, 12)
    ax1.grid(axis='y', alpha=0.3)
    
    # Right panel: Evaluation scope
    metrics = ['Total Tests', 'Social Bias\nCategories', 'Models\nCompared', 'Cost per\n1000 Tests']
    values = [116972, 11, 2, 0.087]  # $10.13 / 116.972 = $0.087 per 1000 tests
    
    # Use different scales for different metrics
    ax2_twin = ax2.twinx()
    
    # Plot total tests on left axis
    bar1 = ax2.bar('Total Tests', 116972, color='#2E86AB', alpha=0.8, width=0.6)
    ax2.text(0, 120000, '116,972', ha='center', va='bottom', fontweight='bold', fontsize=11)
    
    # Plot other metrics on right axis  
    other_metrics = ['Social Bias\nCategories', 'Models\nCompared', 'Cost per\n1000 Tests']
    other_values = [11, 2, 0.087]
    x_pos = [1, 2, 3]
    bars2 = ax2_twin.bar(x_pos, other_values, color=['#A23B72', '#F18F01', '#06D6A0'], 
                        alpha=0.8, width=0.6)
    
    for i, (bar, val) in enumerate(zip(bars2, other_values)):
        if i == 2:  # Cost per 1000 tests
            label = f'${val:.3f}'
        else:
            label = str(int(val))
        ax2_twin.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.2, 
                     label, ha='center', va='bottom', fontweight='bold', fontsize=11)
    
    ax2.set_ylabel('Number of Tests', fontsize=12, fontweight='bold', color='#2E86AB')
    ax2_twin.set_ylabel('Count / Cost per 1K Tests', fontsize=12, fontweight='bold')
    ax2.set_title('Comprehensive Evaluation Scope\nAccessible Methodology', fontsize=14, fontweight='bold')
    
    ax2.set_xticks([0, 1, 2, 3])
    ax2.set_xticklabels(['Total Tests'] + other_metrics, rotation=15, ha='right')
    ax2.set_ylim(0, 140000)
    ax2_twin.set_ylim(0, 15)
    
    plt.suptitle('Bias Evaluation Methodology: Cost and Scope\nStandardized, Reproducible Assessment', 
                 fontsize=16, fontweight='bold', y=0.95)
    
    plt.tight_layout()
    plt.savefig('/Users/mdangelo/projects/pf2/site/static/img/blog/bbq-bias/methodology-accessibility-rigorous.png', 
                dpi=300, bbox_inches='tight', facecolor='white')
    plt.close()

def main():
    print("🎨 Creating rigorous, professional charts...")
    print("🔧 Removing sensationalistic language")
    print("📊 Ensuring data accuracy and clarity")
    
    create_primary_findings_chart()
    print("✅ Primary findings chart created")
    
    create_development_timeline_chart() 
    print("✅ Development timeline chart created")
    
    create_methodology_accessibility_chart()
    print("✅ Methodology accessibility chart created")
    
    print("\n📈 All rigorous charts generated successfully!")
    print("🎯 Charts now match the professional tone of the cleaned article")

if __name__ == "__main__":
    main()