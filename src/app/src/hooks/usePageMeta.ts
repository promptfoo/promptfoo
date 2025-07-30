import { useEffect } from 'react';

interface PageMetaOptions {
  title: string;
  description?: string;
  image?: string;
}

export function usePageMeta({ title, description, image }: PageMetaOptions) {
  useEffect(() => {
    const defaultTitle = document.title;
    const descriptionTag = document.querySelector('meta[name="description"]');
    const defaultDescription = descriptionTag?.getAttribute('content') || '';
    const ogTitleTag = document.querySelector('meta[property="og:title"]');
    const defaultOgTitle = ogTitleTag?.getAttribute('content') || '';
    const ogDescriptionTag = document.querySelector('meta[property="og:description"]');
    const defaultOgDescription = ogDescriptionTag?.getAttribute('content') || '';
    const ogImageTag = document.querySelector('meta[property="og:image"]');
    const defaultOgImage = ogImageTag?.getAttribute('content') || '';

    document.title = `${title} | promptfoo`;
    if (description && descriptionTag) {
      descriptionTag.setAttribute('content', description);
    }
    if (ogTitleTag) {
      ogTitleTag.setAttribute('content', `${title} | promptfoo`);
    }
    if (description && ogDescriptionTag) {
      ogDescriptionTag.setAttribute('content', description);
    }
    if (image && ogImageTag) {
      ogImageTag.setAttribute('content', image);
    }

    return () => {
      document.title = defaultTitle;
      if (descriptionTag) {
        descriptionTag.setAttribute('content', defaultDescription);
      }
      if (ogTitleTag) {
        ogTitleTag.setAttribute('content', defaultOgTitle);
      }
      if (ogDescriptionTag) {
        ogDescriptionTag.setAttribute('content', defaultOgDescription);
      }
      if (ogImageTag) {
        ogImageTag.setAttribute('content', defaultOgImage);
      }
    };
  }, [title, description, image]);
}
