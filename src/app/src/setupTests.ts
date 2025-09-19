import '@testing-library/jest-dom';
// Ensure Prism is initialized before any language components are loaded
import 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-http';

// Mock ResizeObserver for MUI DataGrid compatibility with jsdom
function resizeObserverMock(callback: ResizeObserverCallback) {
  return {
    observe: (element: Element) => {
      setTimeout(() => {
        callback(
          [
            {
              target: element,
              borderBoxSize: [{ blockSize: element.clientHeight, inlineSize: element.clientWidth }],
              contentBoxSize: [
                { blockSize: element.clientHeight, inlineSize: element.clientWidth },
              ],
              contentRect: {
                x: 0,
                y: 0,
                width: element.clientWidth,
                height: element.clientHeight,
                top: 0,
                right: element.clientWidth,
                bottom: element.clientHeight,
                left: 0,
                toJSON: () => ({}),
              },
              devicePixelContentBoxSize: [
                { blockSize: element.clientHeight, inlineSize: element.clientWidth },
              ],
            },
          ] as ResizeObserverEntry[],
          this,
        );
      }, 0);
    },
    disconnect: () => {},
    unobserve: () => {},
  };
}

// Set ResizeObserver mock globally
global.ResizeObserver = resizeObserverMock as unknown as typeof ResizeObserver;

// Patch CSS style property setter to handle CSS custom properties in jsdom v27
// This fixes the "Cannot create property 'border-width' on string..." error with MUI DataGrid
const originalSetProperty = CSSStyleDeclaration.prototype.setProperty;
CSSStyleDeclaration.prototype.setProperty = function (
  property: string,
  value: string,
  priority?: string,
) {
  try {
    // For CSS custom properties or values containing var(), skip the error-prone parsing
    if (property.startsWith('--') || (typeof value === 'string' && value.includes('var('))) {
      // Instead of throwing an error, just add it to the style object directly
      (this as any)[property] = value;
      return;
    }
    return originalSetProperty.call(this, property, value, priority);
  } catch (error) {
    // If the property setting fails, silently ignore it for test environments
    // This prevents CSS parsing errors from breaking MUI component tests
    console.debug('CSS property setting failed:', property, value, error);
  }
};

// We can mock the environment variables. For example:
// process.env.PROMPTFOO_VERSION = '1.0.0';
