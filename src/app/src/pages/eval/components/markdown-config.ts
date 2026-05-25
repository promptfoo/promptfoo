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

const INLINE_IMAGE_DATA_URI =
  /^data:(?:image\/[a-z0-9.+-]+|application\/octet-stream)(?:;[^,\s]*)*;base64,/i;

/**
 * Allows base64 image sources required for image previews while retaining
 * react-markdown's safe protocol handling for links and other URLs.
 */
export const INLINE_IMAGE_URL_TRANSFORM: UrlTransform = (url, key, node) => {
  if (key === 'src' && node.tagName === 'img' && INLINE_IMAGE_DATA_URI.test(url.trim())) {
    return url;
  }

  return defaultUrlTransform(url);
};
