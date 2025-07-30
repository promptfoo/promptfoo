#!/usr/bin/env python3
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

# Data
categories = ['Hallucinations\nCaught', 'False\nPositives']
llm_rubric = [12, 3]
web_search = [94, 1]

# Set up the plot
fig, ax = plt.subplots(figsize=(10, 6))
x = np.arange(len(categories))
width = 0.35

# Create bars
bars1 = ax.bar(x - width/2, llm_rubric, width, label='llm-rubric', color='#FF6B6B', alpha=0.8)
bars2 = ax.bar(x + width/2, web_search, width, label='web-search', color='#4ECDC4', alpha=0.8)

# Customize the plot
ax.set_ylabel('Percentage (%)', fontsize=14, fontweight='bold')
ax.set_title('Web Search vs Traditional LLM Rubric Performance', fontsize=16, fontweight='bold', pad=20)
ax.set_xticks(x)
ax.set_xticklabels(categories, fontsize=12)
ax.legend(fontsize=12, loc='upper right')
ax.set_ylim(0, 100)
ax.grid(True, axis='y', alpha=0.3, linestyle='--')

# Add value labels on bars
def add_value_labels(bars):
    for bar in bars:
        height = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2., height + 1,
                f'{height}%', ha='center', va='bottom', fontsize=11, fontweight='bold')

add_value_labels(bars1)
add_value_labels(bars2)

# Add performance improvement annotation
ax.annotate('8× improvement', 
            xy=(0.5, 94), xytext=(0.5, 75),
            arrowprops=dict(arrowstyle='->', color='green', lw=2),
            fontsize=14, fontweight='bold', color='green',
            ha='center')

# Style improvements
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.spines['left'].set_linewidth(0.5)
ax.spines['bottom'].set_linewidth(0.5)

# Save with high DPI for retina displays
plt.tight_layout()
plt.savefig('site/static/img/blog/web-search-assertions/benchmark.png', dpi=200, bbox_inches='tight', 
            facecolor='white', edgecolor='none')
plt.close()

print("Benchmark chart created successfully!")