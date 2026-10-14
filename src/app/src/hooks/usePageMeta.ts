import { useEffect } from 'react';

interface PageMetaOptions {
  title: string;
  description?: string;
  image?: string;
}

export function usePageMeta({ title, description, image }: PageMetaOptions) {
  useEffect(() => {
    const defaultTitle = document.title;
    // Capture every original value before writing: multiple selectors can match one element.
    const metaTags = (
      [
        ['meta[name="description"]', description],
        ['meta[property="og:title"]', `${title} | promptfoo`],
        ['meta[property="og:description"]', description],
        ['meta[property="og:image"]', image],
      ] as const
    ).map(([selector, content]) => {
      const element = document.querySelector(selector);
      return { element, content, original: element?.getAttribute('content') || '' };
    });

    document.title = `${title} | promptfoo`;
    for (const { element, content } of metaTags) {
      if (content) {
        element?.setAttribute('content', content);
      }
    }

    return () => {
      document.title = defaultTitle;
      for (const { element, original } of metaTags) {
        element?.setAttribute('content', original);
      }
    };
  }, [title, description, image]);
}
