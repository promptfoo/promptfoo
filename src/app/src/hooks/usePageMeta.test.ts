import { createElement } from 'react';

import { cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePageMeta } from './usePageMeta';

const originals = [
  'Original description',
  'Original OG title',
  'Original OG description',
  'Original OG image',
];
const contents = () =>
  Array.from(document.querySelectorAll('meta'), (tag) => tag.getAttribute('content'));
const longString = 'This is a very long string. '.repeat(100);

describe('usePageMeta', () => {
  let originalHead: string;
  let tags: HTMLMetaElement[];

  beforeEach(() => {
    originalHead = document.head.innerHTML;
    document.head.innerHTML = `
      <title>Original Title</title>
      <meta name="description" content="Original description">
      <meta property="og:title" content="Original OG title">
      <meta property="og:description" content="Original OG description">
      <meta property="og:image" content="Original OG image">
    `;
    tags = Array.from(document.querySelectorAll('meta'));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.head.innerHTML = originalHead;
  });

  it.each([
    { title: 'Test Page', description: 'Test description', image: 'https://example.com/image.jpg' },
    { title: longString, description: longString, image: 'invalid-image-url' },
    { title: '', description: ' ', image: ' ' },
  ])('sets and restores all fields for $title', ({ title, description, image }) => {
    const { unmount } = renderHook(() => usePageMeta({ title, description, image }));

    // The native title getter normalizes whitespace; the assigned text and OG content do not.
    expect(document.querySelector('title')?.textContent).toBe(`${title} | promptfoo`);
    expect(contents()).toEqual([description, `${title} | promptfoo`, description, image]);
    unmount();
    expect(document.title).toBe('Original Title');
    expect(contents()).toEqual(originals);
  });

  it.each([
    {},
    { description: undefined, image: undefined },
    { description: null, image: null },
    { description: '', image: '' },
  ])('does not write falsey optional fields: %j', (optional) => {
    const spies = [tags[0], tags[2], tags[3]].map((tag) => vi.spyOn(tag, 'setAttribute'));
    const { rerender, unmount } = renderHook(() =>
      usePageMeta({ title: 'Test Page', ...optional } as Parameters<typeof usePageMeta>[0]),
    );

    expect(document.title).toBe('Test Page | promptfoo');
    expect(contents()).toEqual([originals[0], 'Test Page | promptfoo', originals[2], originals[3]]);
    spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    tags[0].setAttribute('content', 'External update');
    rerender();
    expect(tags[0].getAttribute('content')).toBe('External update');
    unmount();
    expect(contents()).toEqual(originals);
  });

  it('updates changed fields and restores optional fields when removed', () => {
    const initialProps: Parameters<typeof usePageMeta>[0] = {
      title: 'Initial',
      description: 'First description',
      image: 'first.png',
    };
    const { rerender, unmount } = renderHook(
      (options: Parameters<typeof usePageMeta>[0]) => usePageMeta(options),
      { initialProps },
    );

    rerender({ ...initialProps, image: 'second.png' });
    expect(contents()).toEqual([
      'First description',
      'Initial | promptfoo',
      'First description',
      'second.png',
    ]);
    rerender({ title: 'Updated', description: 'New description', image: 'third.png' });
    expect(document.title).toBe('Updated | promptfoo');
    expect(contents()).toEqual([
      'New description',
      'Updated | promptfoo',
      'New description',
      'third.png',
    ]);
    rerender({ title: 'Final' });
    expect(contents()).toEqual([originals[0], 'Final | promptfoo', originals[2], originals[3]]);
    unmount();
    expect(document.title).toBe('Original Title');
    expect(contents()).toEqual(originals);
  });

  it.each([false, true])('ignores missing tags without creating them (all missing: %s)', (all) => {
    (all ? tags : [tags[0], tags[2]]).forEach((tag) => tag.remove());
    const { unmount } = renderHook(() =>
      usePageMeta({ title: 'Test Page', description: 'Description', image: 'image.png' }),
    );

    expect(document.title).toBe('Test Page | promptfoo');
    expect(contents()).toEqual(all ? [] : ['Test Page | promptfoo', 'image.png']);
    unmount();
    expect(contents()).toEqual(all ? [] : [originals[1], originals[3]]);
    expect(document.title).toBe('Original Title');
  });

  it('restores missing and empty content attributes as empty strings', () => {
    tags[0].removeAttribute('content');
    tags[2].setAttribute('content', '');
    const { unmount } = renderHook(() => usePageMeta({ title: 'Page' }));

    expect(tags[0].hasAttribute('content')).toBe(false);
    unmount();
    expect(tags[0].hasAttribute('content')).toBe(true);
    expect(contents()).toEqual(['', originals[1], '', originals[3]]);
  });

  it('snapshots aliased selectors before writing and leaves later matches untouched', () => {
    tags[0].setAttribute('property', 'og:title');
    const duplicate = tags[0].cloneNode(true) as HTMLMetaElement;
    document.head.appendChild(duplicate);
    const { unmount } = renderHook(() =>
      usePageMeta({ title: 'Page', description: 'Description' }),
    );

    expect(tags[0].getAttribute('content')).toBe('Page | promptfoo');
    expect(tags[1].getAttribute('content')).toBe(originals[1]);
    expect(duplicate.getAttribute('content')).toBe(originals[0]);
    unmount();
    expect(tags[0].getAttribute('content')).toBe(originals[0]);
    expect(duplicate.getAttribute('content')).toBe(originals[0]);
  });

  it('restores captured nodes after they are detached or replaced', () => {
    const { unmount } = renderHook(() =>
      usePageMeta({ title: 'Page', description: 'Description' }),
    );
    const replacement = tags[0].cloneNode(true) as HTMLMetaElement;
    replacement.setAttribute('content', 'Replacement');
    tags[0].replaceWith(replacement);
    tags[2].remove();
    unmount();

    expect(tags.map((tag) => tag.getAttribute('content'))).toEqual(originals);
    expect(replacement.getAttribute('content')).toBe('Replacement');
  });

  it('restores original metadata after StrictMode effect replay', () => {
    const { unmount } = renderHook(
      () => usePageMeta({ title: 'Strict', description: 'Description', image: 'image.png' }),
      { reactStrictMode: true },
    );

    expect(contents()).toEqual(['Description', 'Strict | promptfoo', 'Description', 'image.png']);
    unmount();
    expect(contents()).toEqual(originals);
    expect(document.title).toBe('Original Title');
  });

  it('restores a parent hook after a nested child mounts and unmounts', () => {
    function Child() {
      usePageMeta({ title: 'Child', description: 'Child description' });
      return null;
    }
    function Parent({ children }: { children?: React.ReactNode }) {
      usePageMeta({ title: 'Parent', description: 'Parent description' });
      return children;
    }
    const { rerender, unmount } = render(createElement(Parent));

    rerender(createElement(Parent, null, createElement(Child)));
    expect(document.title).toBe('Child | promptfoo');
    rerender(createElement(Parent));
    expect(contents()).toEqual([
      'Parent description',
      'Parent | promptfoo',
      'Parent description',
      originals[3],
    ]);
    unmount();
    expect(document.title).toBe('Original Title');
    expect(contents()).toEqual(originals);
  });
});
