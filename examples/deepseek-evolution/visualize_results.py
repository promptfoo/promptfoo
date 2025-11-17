#!/usr/bin/env python3
"""
Generate publication-quality visualizations for DeepSeek censorship evolution study
Focus: Make compressed data (99-100%) visually compelling
"""

import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import seaborn as sns
import numpy as np
from pathlib import Path

# Set style
plt.style.use('seaborn-v0_8-darkgrid')
sns.set_palette("colorblind")
plt.rcParams['figure.dpi'] = 300
plt.rcParams['savefig.dpi'] = 300
plt.rcParams['font.size'] = 10
plt.rcParams['font.family'] = 'sans-serif'

# Load data
df = pd.read_csv('../../output/results-summary.csv')

# Model ordering for timeline
model_order = [
    'R1 (Jan 2025)',
    'R1-0528 (May 2025)',
    'V3.1 (Aug 2025)',
    'V3.1-Terminus (Sep 2025)',
    'V3.2-Exp (Sep 2025)'
]

# Short labels for tight spaces
model_labels_short = ['R1', 'R1-0528', 'V3.1', 'V3.1-T', 'V3.2']

# Color scheme (colorblind-friendly)
colors = {
    'english': '#0173B2',  # Blue
    'chinese': '#DE8F05',  # Orange
    'ceiling': '#CC78BC',  # Purple
    'ccp': '#CA5140',      # Red
    'soft': '#ECE133',     # Yellow
    'corporate': '#56B4E9' # Light blue
}

output_dir = Path('.')
output_dir.mkdir(exist_ok=True)

print("Generating visualizations...")
print(f"Data loaded: {len(df)} rows")
print(f"Languages: {df['language'].unique()}")
print(f"Models: {df['model'].unique()}")

##############################################################################
# VIZ #1: CEILING EFFECT - Show stagnation at 99-100%
##############################################################################
print("\n[1/6] Generating Ceiling Effect visualization...")

fig, ax = plt.subplots(figsize=(10, 6))

# Prepare data
en_data = df[df['language'] == 'English'].set_index('model').reindex(model_order)
zh_data = df[df['language'] == 'Chinese'].set_index('model').reindex(model_order)

x = np.arange(len(model_order))

# Plot lines
ax.plot(x, en_data['censorship_pct'], 'o-', linewidth=2.5, markersize=8,
        color=colors['english'], label='English', zorder=3)
ax.plot(x, zh_data['censorship_pct'], 's--', linewidth=2.5, markersize=8,
        color=colors['chinese'], label='Chinese', zorder=3)

# Add ceiling line
ax.axhline(y=100, color=colors['ceiling'], linestyle='-', linewidth=3,
           alpha=0.7, zorder=1, label='100% Ceiling')

# Highlight V3 Chinese dip
v3_dip_start = 2  # V3.1
v3_dip_end = 3    # V3.1-Terminus
ax.fill_between([v3_dip_start-0.3, v3_dip_end+0.3], 89, 93,
                 alpha=0.2, color=colors['chinese'], zorder=0)
ax.annotate('V3 degradation\n(Chinese only)',
            xy=(v3_dip_end, zh_data.iloc[v3_dip_end]['censorship_pct']),
            xytext=(v3_dip_end+0.3, 88),
            fontsize=9, ha='left',
            arrowprops=dict(arrowstyle='->', color=colors['chinese'], lw=1.5))

# Styling
ax.set_ylim(88, 101)
ax.set_xlim(-0.5, len(model_order)-0.5)
ax.set_xticks(x)
ax.set_xticklabels(model_labels_short, fontsize=11)
ax.set_ylabel('Censorship Rate (%)', fontsize=12, fontweight='bold')
ax.set_xlabel('Model Version (Jan → Sep 2025)', fontsize=12, fontweight='bold')
ax.set_title('DeepSeek Censorship: 9 Months, 5 Releases, Still 99% Censored',
             fontsize=14, fontweight='bold', pad=20)

# Add grid
ax.yaxis.grid(True, linestyle=':', alpha=0.6, zorder=0)
ax.set_axisbelow(True)

# Add annotation about truncated axis
ax.text(0.02, 0.02, 'Note: Y-axis starts at 88% (not 0%) to show variation',
        transform=ax.transAxes, fontsize=8, style='italic',
        bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.3))

# Legend
ax.legend(loc='lower left', fontsize=10, framealpha=0.9)

plt.tight_layout()
plt.savefig(output_dir / 'viz_1_ceiling_effect.png', dpi=300, bbox_inches='tight')
plt.savefig(output_dir / 'viz_1_ceiling_effect.svg', bbox_inches='tight')
print("✓ Saved: viz_1_ceiling_effect.png/svg")
plt.close()

##############################################################################
# VIZ #2: DELTA FROM BASELINE - What actually changed
##############################################################################
print("\n[2/6] Generating Delta from Baseline visualization...")

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5), sharey=True)

# Calculate deltas from R1
en_baseline = en_data.iloc[0]['censorship_pct']
zh_baseline = zh_data.iloc[0]['censorship_pct']

en_delta = en_data['censorship_pct'] - en_baseline
zh_delta = zh_data['censorship_pct'] - zh_baseline

# English panel
ax1.plot(x, en_delta, 'o-', linewidth=2.5, markersize=8,
         color=colors['english'], zorder=3)
ax1.axhline(y=0, color='gray', linestyle='--', linewidth=1, alpha=0.5, zorder=1)
ax1.fill_between(x, 0, en_delta, alpha=0.2, color=colors['english'])
ax1.set_title('English: No Improvement', fontsize=12, fontweight='bold')
ax1.set_ylabel('Change from R1 Baseline (pp)', fontsize=11, fontweight='bold')
ax1.set_xticks(x)
ax1.set_xticklabels(model_labels_short, rotation=0)
ax1.grid(True, alpha=0.3, linestyle=':')
ax1.set_ylim(-10, 1)

# Add annotation
ax1.text(2.5, -0.3, 'Essentially flat\n(max ±0.2pp)',
         fontsize=9, ha='center', style='italic',
         bbox=dict(boxstyle='round', facecolor='lightblue', alpha=0.5))

# Chinese panel
ax2.plot(x, zh_delta, 's-', linewidth=2.5, markersize=8,
         color=colors['chinese'], zorder=3)
ax2.axhline(y=0, color='gray', linestyle='--', linewidth=1, alpha=0.5, zorder=1)
ax2.fill_between(x, 0, zh_delta, alpha=0.2, color=colors['chinese'])
ax2.set_title('Chinese: V3 Degradation', fontsize=12, fontweight='bold')
ax2.set_xticks(x)
ax2.set_xticklabels(model_labels_short, rotation=0)
ax2.grid(True, alpha=0.3, linestyle=':')

# Highlight V3 degradation
v3_models = [2, 3, 4]
for i in v3_models:
    if zh_delta.iloc[i] < -2:
        ax2.annotate(f'{zh_delta.iloc[i]:.1f}pp',
                    xy=(x[i], zh_delta.iloc[i]),
                    xytext=(x[i]+0.1, zh_delta.iloc[i]-1.5),
                    fontsize=9, color=colors['chinese'], fontweight='bold')

fig.suptitle('Change in Censorship Rate vs R1 Baseline',
             fontsize=14, fontweight='bold', y=1.02)
plt.tight_layout()
plt.savefig(output_dir / 'viz_2_delta_baseline.png', dpi=300, bbox_inches='tight')
plt.savefig(output_dir / 'viz_2_delta_baseline.svg', bbox_inches='tight')
print("✓ Saved: viz_2_delta_baseline.png/svg")
plt.close()

##############################################################################
# VIZ #3: STYLE SHIFT - 4× CCP increase (horizontal stacked bars)
##############################################################################
print("\n[3/6] Generating Style Shift visualization...")

fig, ax = plt.subplots(figsize=(10, 6))

# Focus on R1, R1-0528, V3.2 (English only for clarity)
models_subset = ['R1 (Jan 2025)', 'R1-0528 (May 2025)', 'V3.2-Exp (Sep 2025)']
subset_data = df[(df['language'] == 'English') & (df['model'].isin(models_subset))]
subset_data = subset_data.set_index('model').reindex(models_subset)

# Calculate proportions
ccp_pct = subset_data['ccp_echo_pct'].values
refusal_pct = subset_data['refusal_pct'].values
# Soft refusal = censored but not CCP and not explicit refusal
# For simplicity, use: 100 - CCP - explicit_refusal as "other"
other_pct = 100 - ccp_pct - refusal_pct

y_pos = np.arange(len(models_subset))

# Stacked horizontal bars
bar1 = ax.barh(y_pos, other_pct, color=colors['soft'], label='Soft/Evasive', edgecolor='white', linewidth=1.5)
bar2 = ax.barh(y_pos, ccp_pct, left=other_pct, color=colors['ccp'], label='CCP Narrative', edgecolor='white', linewidth=1.5)
bar3 = ax.barh(y_pos, refusal_pct, left=other_pct+ccp_pct, color=colors['corporate'], label='Explicit Refusal', edgecolor='white', linewidth=1.5)

# Add percentage labels
for i, (m, c, r, o) in enumerate(zip(models_subset, ccp_pct, refusal_pct, other_pct)):
    # CCP percentage
    ax.text(o + c/2, i, f'{c:.0f}%', ha='center', va='center',
            fontsize=10, fontweight='bold', color='white')

# Add annotations for key changes
ax.annotate('4× increase →', xy=(other_pct[0] + ccp_pct[0], 0),
            xytext=(65, 0.5), fontsize=11, fontweight='bold',
            color=colors['ccp'], arrowprops=dict(arrowstyle='->', lw=2, color=colors['ccp']))

ax.annotate('↓ Reverted', xy=(other_pct[2] + ccp_pct[2], 2),
            xytext=(25, 2.5), fontsize=11, fontweight='bold',
            color=colors['ccp'], arrowprops=dict(arrowstyle='->', lw=2, color=colors['ccp']))

# Styling
ax.set_yticks(y_pos)
ax.set_yticklabels(['R1\n(Jan)', 'R1-0528\n(May)', 'V3.2\n(Sep)'], fontsize=11)
ax.set_xlabel('Refusal Style Composition (%)', fontsize=12, fontweight='bold')
ax.set_title('Same Censorship Rate (99%), Different Propaganda Level',
             fontsize=14, fontweight='bold', pad=20)
ax.set_xlim(0, 100)
ax.legend(loc='lower right', fontsize=10, framealpha=0.9)
ax.grid(axis='x', alpha=0.3, linestyle=':')

plt.tight_layout()
plt.savefig(output_dir / 'viz_3_style_shift.png', dpi=300, bbox_inches='tight')
plt.savefig(output_dir / 'viz_3_style_shift.svg', bbox_inches='tight')
print("✓ Saved: viz_3_style_shift.png/svg")
plt.close()

##############################################################################
# VIZ #4: CCP ECHO TIMELINE - Only metric with real variance
##############################################################################
print("\n[4/6] Generating CCP Echo Timeline visualization...")

fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 8), sharex=True)

# English panel
en_ccp = en_data['ccp_echo_pct'].values
ax1.plot(x, en_ccp, 'o-', linewidth=3, markersize=10,
         color=colors['english'], zorder=3)
ax1.fill_between(x, 0, en_ccp, alpha=0.2, color=colors['english'])

# Highlight the spike
spike_idx = 1  # R1-0528
ax1.annotate(f'{en_ccp[spike_idx]:.1f}%\n4.3× increase',
            xy=(x[spike_idx], en_ccp[spike_idx]),
            xytext=(x[spike_idx]+0.5, en_ccp[spike_idx]+3),
            fontsize=12, fontweight='bold', color=colors['ccp'],
            arrowprops=dict(arrowstyle='->', lw=2, color=colors['ccp']),
            bbox=dict(boxstyle='round', facecolor='white', edgecolor=colors['ccp'], linewidth=2))

ax1.set_ylabel('CCP Echo Rate (%)', fontsize=11, fontweight='bold')
ax1.set_title('English: Propaganda Spike in R1-0528', fontsize=12, fontweight='bold')
ax1.grid(True, alpha=0.3, linestyle=':')
ax1.set_ylim(0, 25)

# Chinese panel
zh_ccp = zh_data['ccp_echo_pct'].values
ax2.plot(x, zh_ccp, 's-', linewidth=3, markersize=10,
         color=colors['chinese'], zorder=3)
ax2.fill_between(x, 0, zh_ccp, alpha=0.2, color=colors['chinese'])

# Annotations
ax2.annotate(f'{zh_ccp[spike_idx]:.1f}%\n(higher than EN)',
            xy=(x[spike_idx], zh_ccp[spike_idx]),
            xytext=(x[spike_idx]+0.5, zh_ccp[spike_idx]-3),
            fontsize=12, fontweight='bold', color=colors['ccp'],
            arrowprops=dict(arrowstyle='->', lw=2, color=colors['ccp']),
            bbox=dict(boxstyle='round', facecolor='white', edgecolor=colors['ccp'], linewidth=2))

ax2.set_ylabel('CCP Echo Rate (%)', fontsize=11, fontweight='bold')
ax2.set_xlabel('Model Version', fontsize=12, fontweight='bold')
ax2.set_title('Chinese: Consistently Higher (NIST predicted 1.5-10×)',
              fontsize=12, fontweight='bold')
ax2.set_xticks(x)
ax2.set_xticklabels(model_labels_short)
ax2.grid(True, alpha=0.3, linestyle=':')
ax2.set_ylim(0, 25)

fig.suptitle('CCP Propaganda Language Evolution', fontsize=14, fontweight='bold', y=0.995)
plt.tight_layout()
plt.savefig(output_dir / 'viz_4_ccp_timeline.png', dpi=300, bbox_inches='tight')
plt.savefig(output_dir / 'viz_4_ccp_timeline.svg', bbox_inches='tight')
print("✓ Saved: viz_4_ccp_timeline.png/svg")
plt.close()

##############################################################################
# VIZ #5: THOUGHT SUPPRESSION - Make 100% visceral
##############################################################################
print("\n[5/6] Generating Thought Suppression visualization...")

fig, ax = plt.subplots(figsize=(10, 8))

# Total tests = 1360 prompts × 5 models × 2 languages = 13,600 tests
# But we only have results for the models we tested
total_tests_en = 1360 * 5  # 6,800
total_tests_zh = 1360 * 5  # 6,800
total_tests = total_tests_en + total_tests_zh  # 13,600

# Calculate thought suppression across all tests
en_suppressed = en_data['thought_suppression'].sum()
zh_suppressed = zh_data['thought_suppression'].sum()
total_suppressed = en_suppressed + zh_suppressed

# Create dot grid (simplified - show proportion)
dots_per_row = 100
num_rows = 68  # To represent ~6,800 tests

# Create grid
suppressed_count = int((total_suppressed / total_tests) * dots_per_row * num_rows)
total_dots = dots_per_row * num_rows

# Generate positions
x_dots = []
y_dots = []
colors_dots = []

for row in range(num_rows):
    for col in range(dots_per_row):
        idx = row * dots_per_row + col
        x_dots.append(col)
        y_dots.append(row)
        colors_dots.append(colors['ccp'] if idx < suppressed_count else '#2ECC71')

# Plot dots
ax.scatter(x_dots, y_dots, c=colors_dots, s=3, alpha=0.8, marker='o', linewidths=0)

# Add annotations
suppression_rate = (total_suppressed / total_tests) * 100
ax.text(50, num_rows + 3, f'{total_suppressed:,} / {total_tests:,} tests',
        ha='center', fontsize=16, fontweight='bold')
ax.text(50, num_rows + 6, f'{suppression_rate:.1f}% Thought Suppression Rate',
        ha='center', fontsize=14, fontweight='bold', color=colors['ccp'])

# Small legend
ax.scatter([5], [-4], c=[colors['ccp']], s=50, marker='o')
ax.text(8, -4, f'Reasoning hidden ({suppression_rate:.1f}%)',
        va='center', fontsize=10)
ax.scatter([55], [-4], c=['#2ECC71'], s=50, marker='o')
ax.text(58, -4, f'Reasoning visible ({100-suppression_rate:.1f}%)',
        va='center', fontsize=10)

# Styling
ax.set_xlim(-2, dots_per_row + 2)
ax.set_ylim(-8, num_rows + 8)
ax.axis('off')
ax.set_title('Universal Thought Suppression Across All Models & Languages',
             fontsize=14, fontweight='bold', pad=20)

# Add subtitle
ax.text(50, -6, 'Each dot represents ~2 test cases',
        ha='center', fontsize=9, style='italic', color='gray')

plt.tight_layout()
plt.savefig(output_dir / 'viz_5_thought_suppression.png', dpi=300, bbox_inches='tight')
plt.savefig(output_dir / 'viz_5_thought_suppression.svg', bbox_inches='tight')
print("✓ Saved: viz_5_thought_suppression.png/svg")
plt.close()

##############################################################################
# VIZ #6: LANGUAGE DIVERGENCE - V3 degradation
##############################################################################
print("\n[6/6] Generating Language Divergence visualization...")

fig, ax = plt.subplots(figsize=(10, 6))

# Focus on V3 models only
v3_models = ['V3.1 (Aug 2025)', 'V3.1-Terminus (Sep 2025)', 'V3.2-Exp (Sep 2025)']
v3_en = df[(df['language'] == 'English') & (df['model'].isin(v3_models))].set_index('model').reindex(v3_models)
v3_zh = df[(df['language'] == 'Chinese') & (df['model'].isin(v3_models))].set_index('model').reindex(v3_models)

# Calculate gap
gap = v3_en['censorship_pct'].values - v3_zh['censorship_pct'].values

y_pos = np.arange(len(v3_models))

# Diverging bars
for i, (en_val, zh_val, g) in enumerate(zip(v3_en['censorship_pct'].values,
                                              v3_zh['censorship_pct'].values, gap)):
    # English bar (right)
    ax.barh(i, en_val, left=0, height=0.35, color=colors['english'],
            label='English' if i == 0 else '', alpha=0.8)
    # Chinese bar (left, shown as negative for diverging effect)
    ax.barh(i - 0.35, zh_val, left=0, height=0.35, color=colors['chinese'],
            label='Chinese' if i == 0 else '', alpha=0.8)

    # Add gap annotation
    ax.text(101, i-0.175, f'Gap: {g:.1f}pp', va='center', fontsize=10,
            fontweight='bold', color='red' if g > 5 else 'black')

    # Add percentages
    ax.text(en_val - 1, i, f'{en_val:.1f}%', va='center', ha='right',
            fontsize=10, color='white', fontweight='bold')
    ax.text(zh_val - 1, i - 0.35, f'{zh_val:.1f}%', va='center', ha='right',
            fontsize=10, color='white', fontweight='bold')

# Styling
ax.set_yticks(y_pos - 0.175)
ax.set_yticklabels(['V3.1\n(Aug)', 'V3.1-Terminus\n(Sep)', 'V3.2-Exp\n(Sep)'], fontsize=11)
ax.set_xlabel('Censorship Rate (%)', fontsize=12, fontweight='bold')
ax.set_title('V3 Models: Language-Specific Degradation\n(Chinese shows 3-8pp lower censorship rate)',
             fontsize=14, fontweight='bold', pad=20)
ax.set_xlim(88, 110)
ax.axvline(x=100, color='gray', linestyle='--', linewidth=1, alpha=0.5)
ax.legend(loc='lower right', fontsize=11, framealpha=0.9)
ax.grid(axis='x', alpha=0.3, linestyle=':')

# Add note
ax.text(0.5, 0.02, 'Note: R1 models show <1pp gap; V3 models diverge significantly',
        transform=ax.transAxes, fontsize=9, style='italic', ha='center',
        bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.3))

plt.tight_layout()
plt.savefig(output_dir / 'viz_6_language_divergence.png', dpi=300, bbox_inches='tight')
plt.savefig(output_dir / 'viz_6_language_divergence.svg', bbox_inches='tight')
print("✓ Saved: viz_6_language_divergence.png/svg")
plt.close()

print("\n" + "="*80)
print("All visualizations generated successfully!")
print("="*80)
print("\nGenerated files:")
for i in range(1, 7):
    print(f"  • viz_{i}_*.png/svg")
print("\nReview the images and iterate if needed.")
