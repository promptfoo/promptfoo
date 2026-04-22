import remarkGfm from 'remark-gfm';

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
