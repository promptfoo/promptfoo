/**
 * Design tokens for ResultsViewSettings components
 * These provide consistent styling values across all settings components
 */
export const tokens = {
  spacing: {
    section: 4,      // 32px spacing between major sections
    subsection: 2.5, // 20px spacing between subsections
    item: 1.5,       // 12px spacing between items
    
    // More specific spacing values for consistency
    padding: {
      container: 3,    // 24px padding for containers
      item: 1.5,       // 12px padding for items
      compact: 1,      // 8px for tight spaces 
      tiny: 0.5,       // 4px for very small spacing
    },
    
    // Specific margin values
    margin: {
      section: 3,      // 24px margins between sections
      item: 1.5,       // 12px margins between items
      element: 1,      // 8px margins between elements
      icon: 0.75,      // 6px margins for icons
    },
    
    // Stack spacing presets
    stack: {
      large: 2,        // 16px between large stacked elements
      medium: 1.5,     // 12px between medium stacked elements
      small: 1,        // 8px between small stacked elements
      tiny: 0.5,       // 4px between tiny stacked elements
    },
    
    // Alignment indentation
    indent: {
      large: 3,        // 24px indentation
      medium: 2,       // 16px indentation
      small: 1,        // 8px indentation
      tiny: 0.5,       // 4px indentation
    }
  },
  
  borderRadius: {
    small: 1,          // 8px
    medium: 2,         // 16px
    large: 3,          // 24px
    pill: 6,           // 48px - for pill buttons
  },
  
  animation: {
    fast: 150,         // Quick micro-animations
    medium: 250,       // Standard transitions
    slow: 400,         // Emphasis animations
  },
  
  opacity: {
    disabled: 0.6,
    hover: 0.04,
    active: 0.08,
    emphasis: 0.12,
    overlay: 0.8,
  },
  
  elevation: {
    dialog: 5,
    tooltip: 2,
    card: 1,
  },
}; 