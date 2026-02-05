import { afterAll, afterEach, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';
import { loadScrollTimelinePolyfill, supportsScrollTimeline } from './scrollTimelinePolyfill';

vi.mock('../polyfills/scroll-timeline.js', () => ({
  default: {},
}));

declare global {
  interface Window {
    ScrollTimeline?: any;
    ViewTimeline?: any;
  }
}

describe('supportsScrollTimeline', () => {
  const originalWindow = global.window;
  const originalCSS = global.CSS;

  afterAll(() => {
    global.window = originalWindow;
    global.CSS = originalCSS;
  });

  describe('when in a browser environment', () => {
    beforeEach(() => {
      global.window = {
        ScrollTimeline: undefined,
        ViewTimeline: undefined,
      } as Window & typeof globalThis;

      global.CSS = {
        supports: vi.fn(() => false),
      } as unknown as typeof CSS;
    });

    it("should return true when CSS.supports('animation-timeline: scroll()') is true", () => {
      vi.spyOn(global.CSS, 'supports').mockImplementation(
        (property: string) => property === 'animation-timeline: scroll()',
      );

      const result = supportsScrollTimeline();

      expect(result).toBe(true);
      expect(global.CSS.supports).toHaveBeenCalledWith('animation-timeline: scroll()');
    });

    it("should return true when CSS.supports('animation-timeline: --custom-timeline') is true", () => {
      vi.spyOn(global.CSS, 'supports').mockImplementation(
        (property: string) => property === 'animation-timeline: --custom-timeline',
      );

      const result = supportsScrollTimeline();

      expect(result).toBe(true);
      expect(global.CSS.supports).toHaveBeenCalledWith('animation-timeline: --custom-timeline');
    });

    it("should return true when 'ScrollTimeline' exists in the window object", () => {
      global.window.ScrollTimeline = {};

      const result = supportsScrollTimeline();

      expect(result).toBe(true);
    });

    it("should return true when 'ViewTimeline' exists in the window object", () => {
      global.window.ViewTimeline = {};

      const result = supportsScrollTimeline();

      expect(result).toBe(true);
    });
  });

  describe('when in a non-browser (SSR) environment', () => {
    beforeEach(() => {
      global.window = undefined as any;
      global.CSS = undefined as any;
    });

    it('should return true when window is undefined', () => {
      const result = supportsScrollTimeline();
      expect(result).toBe(true);
    });
  });
});

describe('loadScrollTimelinePolyfill', () => {
  let consoleDebugSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    (global as any).CSS = {
      supports: vi.fn(),
    } as unknown as typeof CSS;

    delete (window as any).ScrollTimeline;
    delete (window as any).ViewTimeline;
  });

  afterEach(() => {
    consoleDebugSpy.mockRestore();
    delete (global as any).CSS;
  });

  it("should dynamically import '../polyfills/scroll-timeline.js' and log success when supportsScrollTimeline returns false", async () => {
    vi.mocked(CSS.supports).mockReturnValue(false);

    await loadScrollTimelinePolyfill();

    expect(CSS.supports).toHaveBeenCalledTimes(2);

    expect(consoleDebugSpy).toHaveBeenCalledWith('Loading scroll-timeline polyfill...');
    expect(consoleDebugSpy).toHaveBeenCalledWith('Scroll-timeline polyfill loaded successfully');

    expect(consoleDebugSpy).not.toHaveBeenCalledWith(
      'Browser supports scroll-timeline natively, skipping polyfill',
    );
  });

  it('should not import polyfill and log skipping message when supportsScrollTimeline returns true', async () => {
    vi.mocked(CSS.supports).mockReturnValue(true);

    await loadScrollTimelinePolyfill();

    expect(consoleDebugSpy).toHaveBeenCalledWith(
      'Browser supports scroll-timeline natively, skipping polyfill',
    );
    expect(consoleDebugSpy).not.toHaveBeenCalledWith('Loading scroll-timeline polyfill...');
  });
});
