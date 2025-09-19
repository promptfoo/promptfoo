import '@testing-library/jest-dom';
// Ensure Prism is initialized before any language components are loaded
import 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-http';

// Mock ResizeObserver for MUI DataGrid compatibility with jsdom
function resizeObserverMock(callback: ResizeObserverCallback): ResizeObserver {
  const observer = {
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
          observer as ResizeObserver,
        );
      }, 0);
    },
    disconnect: () => {},
    unobserve: () => {},
  };
  return observer as ResizeObserver;
}

// Set ResizeObserver mock globally
global.ResizeObserver = resizeObserverMock as any;

// Fix CSS custom property parsing for jsdom v27 + MUI DataGrid compatibility
// Patch CSS style property setting to handle CSS custom properties
const originalSetProperty = CSSStyleDeclaration.prototype.setProperty;
CSSStyleDeclaration.prototype.setProperty = function (
  property: string,
  value: string,
  priority?: string,
) {
  try {
    // Call original method first
    return originalSetProperty.call(this, property, value, priority);
  } catch (_error) {
    // If it fails with CSS custom properties, handle gracefully
    if (typeof value === 'string' && value.includes('var(--')) {
      // For CSS custom properties, set them directly without parsing
      (this as any)[property] = value;
      return;
    }
    // Silently ignore other CSS parsing errors in test environment
    return;
  }
};



// We can mock the environment variables. For example:
// process.env.PROMPTFOO_VERSION = '1.0.0';
