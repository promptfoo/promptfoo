import '@testing-library/jest-dom';
// Ensure Prism is initialized before any language components are loaded
import 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-http';

// We can mock the environment variables. For example:
// process.env.PROMPTFOO_VERSION = '1.0.0';

// Fix jsdom CSS custom properties parsing issues with DataGrid
// This handles the border CSS parsing error with CSS variables
if (typeof window !== 'undefined') {
  // Mock CSS property handling for problematic CSS variables
  const originalSetProperty = CSSStyleDeclaration.prototype.setProperty;
  CSSStyleDeclaration.prototype.setProperty = function(property, value, priority) {
    try {
      return originalSetProperty.call(this, property, value, priority);
    } catch (error) {
      // Silently ignore CSS parsing errors for border properties with CSS variables
      if (property.includes('border') && typeof value === 'string' && value.includes('var(')) {
        return;
      }
      throw error;
    }
  };
}
