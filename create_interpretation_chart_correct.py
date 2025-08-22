#!/usr/bin/env python3
"""
Create a CORRECT political interpretations chart
Shows how the SAME empirical finding gets different framings/interpretations
"""

import matplotlib.pyplot as plt
import numpy as np

def create_correct_political_interpretation_chart():
    """Create a chart showing different interpretations of the same data"""
    fig, ax = plt.subplots(1, 1, figsize=(14, 10))
    
    # The key insight: SAME data, DIFFERENT interpretations
    empirical_finding = "+16.8 percentage points increase in 'Unknown' selection"
    
    # Different ways groups interpret this SAME finding
    interpretations = [
        "Conservative:\n'Woke overcaution'\n'Refuses obvious patterns'",
        "Technical:\n'Better calibration'\n'Improved uncertainty quantification'", 
        "Progressive:\n'Bias reduction'\n'Reduced harmful stereotyping'",
        "Safety:\n'Harm prevention'\n'Decreased assumption making'"
    ]
    
    colors = ['#E63946', '#2E86AB', '#06D6A0', '#F18F01']
    sentiment_labels = ['😠 Negative', '🔬 Neutral', '✊ Positive', '🛡️ Positive']
    
    # Create a visualization that emphasizes INTERPRETATION, not measurement
    y_pos = np.arange(len(interpretations))
    
    # Instead of bars showing the same number, create interpretation boxes
    for i, (interp, color, sentiment) in enumerate(zip(interpretations, colors, sentiment_labels)):
        # Create boxes to represent different interpretations
        rect = plt.Rectangle((0, i-0.4), 10, 0.8, facecolor=color, alpha=0.8, edgecolor='black', linewidth=2)
        ax.add_patch(rect)
        
        # Add interpretation text
        ax.text(5, i, interp, ha='center', va='center', fontweight='bold', 
                fontsize=11, color='white')
        
        # Add sentiment indicator
        ax.text(10.5, i, sentiment, ha='left', va='center', fontweight='bold', fontsize=10)
    
    # Central emphasis on the SAME empirical finding
    ax.text(5, len(interpretations), 'THE SAME EMPIRICAL FINDING:', 
            ha='center', va='bottom', fontweight='bold', fontsize=14, color='black')
    ax.text(5, len(interpretations) + 0.3, '+16.8% increase in "Unknown" selection', 
            ha='center', va='bottom', fontweight='bold', fontsize=12, color='red',
            bbox=dict(boxstyle="round,pad=0.3", facecolor='yellow', alpha=0.8))
    
    # Arrow pointing down to show this applies to all interpretations
    ax.annotate('', xy=(5, len(interpretations) - 0.7), xytext=(5, len(interpretations) - 0.2),
                arrowprops=dict(arrowstyle='->', color='red', lw=3))
    
    ax.set_xlim(-1, 12)
    ax.set_ylim(-0.8, len(interpretations) + 0.8)
    ax.set_yticks([])
    ax.set_xticks([])
    
    # Remove spines
    for spine in ax.spines.values():
        spine.set_visible(False)
    
    ax.set_title('Four Political Lenses, One Data Point\nHow Different Groups Interpret the Same AI Behavioral Change', 
                 fontsize=16, fontweight='bold', pad=30)
    
    # Add explanatory text
    ax.text(5, -0.6, 'The exact same empirical finding gets framed differently based on political perspective', 
            ha='center', va='top', fontsize=12, style='italic',
            bbox=dict(boxstyle="round,pad=0.5", facecolor='lightgray', alpha=0.7))
    
    plt.tight_layout()
    plt.savefig('/Users/mdangelo/projects/pf2/site/static/img/blog/bbq-bias/political-interpretations-corrected.png', 
                dpi=300, bbox_inches='tight', facecolor='white')
    plt.close()

def main():
    print("🎨 Creating CORRECTED political interpretations chart...")
    print("🔧 Key fix: Shows how SAME data gets different interpretations, not different measurements")
    
    create_correct_political_interpretation_chart()
    
    print("✅ Corrected chart saved as political-interpretations-corrected.png")
    print("📝 Now shows how the SAME +16.8% finding gets different political framings")

if __name__ == "__main__":
    main()