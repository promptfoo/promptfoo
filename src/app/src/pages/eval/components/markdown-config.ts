import { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { UrlTransform } from 'react-markdown';

/**
 * Stable remark plugins array for ReactMarkdown.
 * Using a module-level constant prevents recreating the array on every render,
 * which would cause ReactMarkdown to re-render even when content hasn't changed.
 *
 * @see https://github.com/promptfoo/promptfoo/issues/969
 */
export const REMARK_PLUGINS = [remarkGfm];

/**
 * Identity URL transform that allows all URLs including data: URIs.
 * Used for ReactMarkdown's urlTransform prop to allow inline images
 * (e.g., base64 encoded images from Gemini image generation).
 *
 * Defined at module level to maintain stable reference across renders.
 */
export const IDENTITY_URL_TRANSFORM = (url: string): string => url;

export const IMAGE_DATA_URL_TRANSFORM: UrlTransform = (url, key, node) => {
  const normalizedUrl = url.trimStart().toLowerCase();
  const isImageDataUrl =
    normalizedUrl.startsWith('data:image/') ||
    normalizedUrl.startsWith('data:application/octet-stream');

  if (key === 'src' && node.tagName === 'img' && isImageDataUrl) {
    return url;
  }

  return defaultUrlTransform(url);
};
