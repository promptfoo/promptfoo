/**
 * Design tokens for ResultsViewSettings components
 * These provide consistent styling values across all settings components
 */
export const tokens = {
  spacing: {
    section: 4,
    subsection: 2.5,
    item: 1.5,

    // More specific spacing values for consistency
    padding: {
      container: 3,
      item: 1.5,
      compact: 1,
      tiny: 0.5,
    },

    // Specific margin values
    margin: {
      section: 3,
      item: 1.5,
      element: 1,
      icon: 0.75,
      tiny: 0.5,
    },

    // Stack spacing presets
    stack: {
      large: 2,
      medium: 1.5,
      small: 1,
      tiny: 0.5,
      icon: 0.75,
    },

    // Alignment indentation
    indent: {
      large: 3,
      medium: 2,
      small: 1,
      tiny: 0.5,
    },
  },

  borderRadius: {
    small: 1,
    medium: 2,
    large: 3,
    pill: 6,
  },

  animation: {
    fast: 150,
    medium: 250,
    slow: 400,
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
