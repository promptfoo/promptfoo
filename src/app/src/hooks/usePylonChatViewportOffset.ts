import { useEffect } from 'react';

/**
 * Applies a transform to the PylonChat to shift it vertically such that it is not hiding
 * elements falling below it on the Z-axis.
 * @param verticalOffset - The amount to shift the PylonChat vertically. Negative values will shift it up,
 * positive values will shift it down.
 */
export function usePylonChatViewportOffset(verticalOffset: number) {
  useEffect(() => {
    const vendorClassNames = [
      'PylonChat-chatWindowFrameContainer',
      'PylonChat-bubbleFrameContainer',
    ];

    const trackedElements = new Set<HTMLElement>();

    // Preserve originals so we can restore them on cleanup
    const originalTransforms = new WeakMap<HTMLElement, string>();
    const originalTranslates = new WeakMap<HTMLElement, string>();
    const supportsTranslateProp =
      typeof CSS !== 'undefined' &&
      typeof (CSS as any).supports === 'function' &&
      (CSS as any).supports('translate', '0 1px');

    const applyTranslateTransform = (element: HTMLElement) => {
      if (supportsTranslateProp) {
        if (!originalTranslates.has(element)) {
          originalTranslates.set(element, (element.style as any).translate || '');
        }
        // Compose without overriding other transforms
        (element.style as any).translate = `0 ${verticalOffset}px`;
      } else {
        if (!originalTransforms.has(element)) {
          originalTransforms.set(element, element.style.transform || '');
        }
        // Remove any previous translateY we might have added, then append fresh
        const cleaned = (element.style.transform || '').replace(/translateY\([^)]*\)/, '').trim();
        element.style.transform = `${cleaned} translateY(${verticalOffset}px)`.trim();
      }
      trackedElements.add(element);
    };

    const resetTranslateTransform = (element: HTMLElement) => {
      if (supportsTranslateProp) {
        (element.style as any).translate = originalTranslates.get(element) ?? '';
      } else {
        element.style.transform = originalTransforms.get(element) ?? '';
      }
    };

    const observeExisting = (observer: IntersectionObserver) => {
      vendorClassNames.forEach((className) => {
        document.querySelectorAll<HTMLElement>(`.${className}`).forEach((el) => {
          observer.observe(el);
        });
      });
    };

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.target instanceof HTMLElement) {
            applyTranslateTransform(entry.target);
          }
        });
      },
      { root: null, threshold: 0 },
    );

    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (!(node instanceof HTMLElement)) {
              return;
            }

            vendorClassNames.forEach((className) => {
              if (node.classList && node.classList.contains(className)) {
                intersectionObserver.observe(node);
              }
              node.querySelectorAll<HTMLElement>(`.${className}`).forEach((el) => {
                intersectionObserver.observe(el);
              });
            });
          });
        }
      }
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });

    observeExisting(intersectionObserver);

    const handleResize = () => {
      trackedElements.forEach((el) => applyTranslateTransform(el));
    };
    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      window.removeEventListener('resize', handleResize);
      mutationObserver.disconnect();
      intersectionObserver.disconnect();
      trackedElements.forEach((el) => resetTranslateTransform(el));
      trackedElements.clear();
    };
  }, [verticalOffset]);
}
