#!/usr/bin/env python3
"""Create hero image for blog post."""

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

def create_hero_image():
    """Create a comprehensive hero image showing key findings."""
    fig = plt.figure(figsize=(16, 10))
    
    # Main title
    fig.suptitle('Grok 4 Political Bias Analysis: 2,500 Questions, 4 Models, Surprising Results', 
                 fontsize=24, fontweight='bold', y=0.98)
    
    # Create grid for subplots
    gs = fig.add_gridspec(3, 3, hspace=0.4, wspace=0.3, 
                          left=0.05, right=0.95, top=0.92, bottom=0.05)
    
    # 1. Political Spectrum (Top row, spanning 2 columns)
    ax1 = fig.add_subplot(gs[0, :2])
    models = ['GPT-4.1', 'Gemini 2.5\nPro', 'Grok-4', 'Claude\nOpus 4']
    scores = [0.745, 0.718, 0.655, 0.646]
    colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4']
    
    bars = ax1.barh(models, scores, color=colors, alpha=0.8, edgecolor='black', linewidth=2)
    ax1.set_xlim(0, 1)
    ax1.axvline(x=0.5, color='gray', linestyle='--', alpha=0.5, linewidth=2)
    ax1.set_xlabel('Political Score (0=Right, 1=Left)', fontweight='bold')
    ax1.set_title('All Models Lean Left, But To Different Degrees', fontsize=16, fontweight='bold')
    
    # Add value labels
    for bar, score in zip(bars, scores):
        ax1.text(score + 0.01, bar.get_y() + bar.get_height()/2, 
                f'{score:.3f}', va='center', fontweight='bold')
    
    # 2. Key Finding Box (Top right)
    ax2 = fig.add_subplot(gs[0, 2])
    ax2.axis('off')
    key_text = "KEY FINDING:\n\nGrok-4 is NOT\nright-wing!\n\nIt's the 2nd most\ncentrist model\n(after Claude)"
    ax2.text(0.5, 0.5, key_text, fontsize=14, ha='center', va='center',
             bbox=dict(boxstyle="round,pad=0.5", facecolor='yellow', alpha=0.7),
             fontweight='bold')
    
    # 3. Extremism Comparison (Middle left)
    ax3 = fig.add_subplot(gs[1, 0])
    extremism = [30.8, 57.8, 67.9, 38.7]
    ax3.bar(['GPT-4.1', 'Gemini', 'Grok-4', 'Claude'], extremism, 
            color=colors, alpha=0.8, edgecolor='black')
    ax3.set_ylabel('Extreme Responses %', fontweight='bold')
    ax3.set_title('Grok Shows Most Extremism', fontsize=14, fontweight='bold')
    ax3.set_ylim(0, 80)
    
    # Add value labels
    for i, (model, val) in enumerate(zip(['GPT-4.1', 'Gemini', 'Grok-4', 'Claude'], extremism)):
        ax3.text(i, val + 1, f'{val}%', ha='center', fontweight='bold')
    
    # 4. Musk Bias (Middle center)
    ax4 = fig.add_subplot(gs[1, 1])
    musk_diff = [-0.058, +0.017, -0.141, -0.033]
    bars = ax4.bar(['GPT-4.1', 'Gemini', 'Grok-4', 'Claude'], musk_diff,
                   color=['red' if x < 0 else 'green' for x in musk_diff], 
                   alpha=0.7, edgecolor='black')
    ax4.set_ylabel('Musk Topic Bias', fontweight='bold')
    ax4.set_title('Grok Most Critical of Musk', fontsize=14, fontweight='bold')
    ax4.axhline(y=0, color='black', linewidth=1)
    ax4.set_ylim(-0.2, 0.05)
    
    # Add value labels
    for bar, val in zip(bars, musk_diff):
        y_pos = val + (0.005 if val > 0 else -0.005)
        ax4.text(bar.get_x() + bar.get_width()/2, y_pos, f'{val:+.3f}', 
                ha='center', va='bottom' if val > 0 else 'top', fontweight='bold')
    
    # 5. Judge Self-Bias (Middle right)
    ax5 = fig.add_subplot(gs[1, 2])
    self_bias = [0.031, 0.005, 0.001]
    bars = ax5.bar(['GPT-4.1***', 'Grok-4', 'Gemini'], self_bias,
                   color=['#FF6B6B', '#45B7D1', '#4ECDC4'], alpha=0.8, edgecolor='black')
    ax5.set_ylabel('Self-Scoring Bias', fontweight='bold')
    ax5.set_title('GPT-4.1 Judges Itself Favorably', fontsize=14, fontweight='bold')
    ax5.set_ylim(0, 0.04)
    
    # Add significance note
    ax5.text(0.5, 0.035, '*** p<0.05', ha='center', fontsize=10, style='italic')
    
    # 6. Summary Stats (Bottom left)
    ax6 = fig.add_subplot(gs[2, 0])
    ax6.axis('off')
    stats_text = "STUDY SCALE:\n\n• 2,500 questions\n• 4 AI models\n• 4 judges each\n• 39,256 judgments\n• 37.8M tokens"
    ax6.text(0.1, 0.5, stats_text, fontsize=12, va='center',
             bbox=dict(boxstyle="round,pad=0.3", facecolor='lightblue', alpha=0.7))
    
    # 7. Contrarian Stat (Bottom center)
    ax7 = fig.add_subplot(gs[2, 1])
    ax7.axis('off')
    contrarian_text = "GROK'S CONTRARIAN\nBEHAVIOR:\n\n15.8% of responses\nopposite of consensus\n\nOnly 2.1% centrist\n(lowest of all models)"
    ax7.text(0.5, 0.5, contrarian_text, fontsize=12, ha='center', va='center',
             bbox=dict(boxstyle="round,pad=0.3", facecolor='orange', alpha=0.7))
    
    # 8. Main Conclusion (Bottom right)
    ax8 = fig.add_subplot(gs[2, 2])
    ax8.axis('off')
    conclusion_text = "CONCLUSION:\n\nAll major AIs\nlean LEFT\n\nGrok is bipolar,\nnot right-wing\n\nClaude is most\ncentrist overall"
    ax8.text(0.5, 0.5, conclusion_text, fontsize=13, ha='center', va='center',
             bbox=dict(boxstyle="round,pad=0.5", facecolor='lightgreen', alpha=0.7),
             fontweight='bold')
    
    plt.tight_layout()
    plt.savefig('hero_image_comprehensive.png', dpi=300, bbox_inches='tight', facecolor='white')
    print("Created: hero_image_comprehensive.png")
    plt.close()

if __name__ == "__main__":
    create_hero_image() 