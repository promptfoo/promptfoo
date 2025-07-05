import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { usePageMeta } from './usePageMeta';

// Mock meta tag elements
const createMockMetaElement = (content = '') => ({
  getAttribute: vi.fn().mockReturnValue(content),
  setAttribute: vi.fn(),
});

describe('usePageMeta', () => {
  const mockDescriptionTag = createMockMetaElement('Original description');
  const mockOgTitleTag = createMockMetaElement('Original OG title');
  const mockOgDescriptionTag = createMockMetaElement('Original OG description');
  const mockOgImageTag = createMockMetaElement('Original OG image');

  beforeEach(() => {
    // Reset document.title
    Object.defineProperty(document, 'title', {
      value: 'Original Title',
      writable: true,
    });

    // Mock querySelector to return our mock elements
    vi.spyOn(document, 'querySelector').mockImplementation((selector) => {
      switch (selector) {
        case 'meta[name="description"]':
          return mockDescriptionTag as any;
        case 'meta[property="og:title"]':
          return mockOgTitleTag as any;
        case 'meta[property="og:description"]':
          return mockOgDescriptionTag as any;
        case 'meta[property="og:image"]':
          return mockOgImageTag as any;
        default:
          return null;
      }
    });

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should set document title with promptfoo suffix', () => {
    renderHook(() => usePageMeta({ title: 'Test Page' }));

    expect(document.title).toBe('Test Page | promptfoo');
  });

  it('should set meta description when provided', () => {
    renderHook(() =>
      usePageMeta({
        title: 'Test Page',
        description: 'Test description',
      }),
    );

    expect(mockDescriptionTag.setAttribute).toHaveBeenCalledWith('content', 'Test description');
  });

  it('should set Open Graph title', () => {
    renderHook(() => usePageMeta({ title: 'Test Page' }));

    expect(mockOgTitleTag.setAttribute).toHaveBeenCalledWith('content', 'Test Page | promptfoo');
  });

  it('should set Open Graph description when provided', () => {
    renderHook(() =>
      usePageMeta({
        title: 'Test Page',
        description: 'Test description',
      }),
    );

    expect(mockOgDescriptionTag.setAttribute).toHaveBeenCalledWith('content', 'Test description');
  });

  it('should set Open Graph image when provided', () => {
    renderHook(() =>
      usePageMeta({
        title: 'Test Page',
        image: 'https://example.com/image.jpg',
      }),
    );

    expect(mockOgImageTag.setAttribute).toHaveBeenCalledWith(
      'content',
      'https://example.com/image.jpg',
    );
  });

  it('should handle missing meta tags gracefully', () => {
    // Mock querySelector to return null for all selectors
    vi.spyOn(document, 'querySelector').mockReturnValue(null);

    expect(() => {
      renderHook(() => usePageMeta({ title: 'Test Page' }));
    }).not.toThrow();

    expect(document.title).toBe('Test Page | promptfoo');
  });

  it('should restore original values on cleanup', () => {
    const { unmount } = renderHook(() =>
      usePageMeta({
        title: 'Test Page',
        description: 'Test description',
      }),
    );

    // Verify values were set
    expect(document.title).toBe('Test Page | promptfoo');
    expect(mockDescriptionTag.setAttribute).toHaveBeenCalledWith('content', 'Test description');

    // Clear mocks to track cleanup calls
    vi.clearAllMocks();

    // Unmount to trigger cleanup
    unmount();

    // Verify cleanup was called (the hook restores the original values it captured during mount)
    expect(document.title).toBe('Original Title');
    expect(mockDescriptionTag.setAttribute).toHaveBeenCalled();
    expect(mockOgTitleTag.setAttribute).toHaveBeenCalled();
    expect(mockOgDescriptionTag.setAttribute).toHaveBeenCalled();
    expect(mockOgImageTag.setAttribute).toHaveBeenCalled();
  });

  it('should update meta tags when props change', () => {
    const { rerender } = renderHook(
      ({ title, description }) => usePageMeta({ title, description }),
      {
        initialProps: { title: 'Initial Title', description: 'Initial description' },
      },
    );

    expect(document.title).toBe('Initial Title | promptfoo');
    expect(mockDescriptionTag.setAttribute).toHaveBeenCalledWith('content', 'Initial description');

    // Update props
    rerender({ title: 'Updated Title', description: 'Updated description' });

    expect(document.title).toBe('Updated Title | promptfoo');
    expect(mockDescriptionTag.setAttribute).toHaveBeenCalledWith('content', 'Updated description');
  });

  it('should not set optional meta tags when not provided', () => {
    renderHook(() => usePageMeta({ title: 'Test Page' }));

    // Should set title and og:title
    expect(document.title).toBe('Test Page | promptfoo');
    expect(mockOgTitleTag.setAttribute).toHaveBeenCalledWith('content', 'Test Page | promptfoo');

    // Should not set description, og:description, or og:image
    expect(mockDescriptionTag.setAttribute).not.toHaveBeenCalled();
    expect(mockOgDescriptionTag.setAttribute).not.toHaveBeenCalled();
    expect(mockOgImageTag.setAttribute).not.toHaveBeenCalled();
  });

  it('should set document title, meta description, Open Graph title, Open Graph description, and Open Graph image when all fields are provided', () => {
    renderHook(() =>
      usePageMeta({
        title: 'Test Page',
        description: 'Test description',
        image: 'https://example.com/image.jpg',
      }),
    );

    expect(document.title).toBe('Test Page | promptfoo');
    expect(mockDescriptionTag.setAttribute).toHaveBeenCalledWith('content', 'Test description');
    expect(mockOgTitleTag.setAttribute).toHaveBeenCalledWith('content', 'Test Page | promptfoo');
    expect(mockOgDescriptionTag.setAttribute).toHaveBeenCalledWith('content', 'Test description');
    expect(mockOgImageTag.setAttribute).toHaveBeenCalledWith(
      'content',
      'https://example.com/image.jpg',
    );
  });

  it('should handle missing meta tags during cleanup gracefully', () => {
    const { unmount } = renderHook(() =>
      usePageMeta({ title: 'Test Page', description: 'Test description' }),
    );

    vi.spyOn(document, 'querySelector').mockReturnValue(null);

    expect(() => {
      unmount();
    }).not.toThrow();
  });

  it('should handle extremely long title and description strings', () => {
    const longString = 'This is a very long string. '.repeat(100);
    renderHook(() =>
      usePageMeta({
        title: longString,
        description: longString,
      }),
    );

    expect(document.title).toBe(`${longString} | promptfoo`);
    expect(mockDescriptionTag.setAttribute).toHaveBeenCalledWith('content', longString);
    expect(mockOgTitleTag.setAttribute).toHaveBeenCalledWith(
      'content',
      `${longString} | promptfoo`,
    );
    expect(mockOgDescriptionTag.setAttribute).toHaveBeenCalledWith('content', longString);
  });

  it('should handle undefined description gracefully', () => {
    renderHook(() => usePageMeta({ title: 'Test Page', description: undefined }));

    expect(document.title).toBe('Test Page | promptfoo');
    expect(mockDescriptionTag.setAttribute).not.toHaveBeenCalled();
    expect(mockOgDescriptionTag.setAttribute).not.toHaveBeenCalled();
  });

  it('should handle null description gracefully', () => {
    renderHook(() => usePageMeta({ title: 'Test Page', description: null as any }));

    expect(document.title).toBe('Test Page | promptfoo');
    expect(mockDescriptionTag.setAttribute).not.toHaveBeenCalled();
    expect(mockOgDescriptionTag.setAttribute).not.toHaveBeenCalled();
  });

  it('should set Open Graph image when provided an invalid URL', () => {
    const invalidImageUrl = 'invalid-image-url';
    renderHook(() =>
      usePageMeta({
        title: 'Test Page',
        image: invalidImageUrl,
      }),
    );

    expect(mockOgImageTag.setAttribute).toHaveBeenCalledWith('content', invalidImageUrl);
  });
});
