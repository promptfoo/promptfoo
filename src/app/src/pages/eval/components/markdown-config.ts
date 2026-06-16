import { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import type { UrlTransform } from 'react-markdown';

/**
 * Stable remark plugins array for ReactMarkdown.
 * Using a module-level constant prevents recreating the array on every render,
 * which would cause ReactMarkdown to re-render even when content hasn't changed.
 *
 * @see https://github.com/promptfoo/promptfoo/issues/969
 */
export const REMARK_PLUGINS = [remarkGfm];

const MARKDOWN_PARSER = unified().use(remarkParse).use(remarkGfm);

interface MarkdownAstNode {
  type: string;
  children?: MarkdownAstNode[];
  identifier?: string;
  url?: string;
}

type MarkdownImageReference = { identifier: string } | { url: string };

/**
 * Identity URL transform that allows all URLs including data: URIs.
 * Used for ReactMarkdown's urlTransform prop to allow inline images
 * (e.g., base64 encoded images from Gemini image generation).
 *
 * Defined at module level to maintain stable reference across renders.
 */
export const IDENTITY_URL_TRANSFORM = (url: string): string => url;

export function isImageDataUrl(url: string): boolean {
  const normalizedUrl = url.trimStart().toLowerCase();
  return (
    normalizedUrl.startsWith('data:image/') ||
    normalizedUrl.startsWith('data:application/octet-stream')
  );
}

function visitMarkdownAst(node: MarkdownAstNode, visitor: (node: MarkdownAstNode) => void): void {
  visitor(node);
  node.children?.forEach((child) => visitMarkdownAst(child, visitor));
}

/**
 * Extract image sources that ReactMarkdown will parse as Markdown images.
 *
 * Parsing with the same remark plugins as ReactMarkdown keeps forced preview
 * and truncation decisions aligned with the image elements it will render.
 */
export function extractRenderableMarkdownImageSources(markdown: string): string[] {
  if (!markdown.includes('![')) {
    return [];
  }

  const definitions = new Map<string, string>();
  const images: MarkdownImageReference[] = [];
  const tree = MARKDOWN_PARSER.parse(markdown) as MarkdownAstNode;

  visitMarkdownAst(tree, (node) => {
    if (node.type === 'definition' && node.identifier && node.url) {
      if (!definitions.has(node.identifier)) {
        definitions.set(node.identifier, node.url);
      }
      return;
    }

    if (node.type === 'image' && node.url) {
      images.push({ url: node.url });
    } else if (node.type === 'imageReference' && node.identifier) {
      images.push({ identifier: node.identifier });
    }
  });

  const sources = new Set<string>();
  for (const image of images) {
    const source = 'url' in image ? image.url : definitions.get(image.identifier);
    if (source) {
      sources.add(source);
    }
  }

  return [...sources];
}

export function extractMarkdownImageSources(markdown: string): string[] {
  const sources = new Set<string>();
  const markdownImageRegex = /!\[[^\]]*]\((<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  const htmlImageRegex = /<img[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi;

  for (const match of markdown.matchAll(markdownImageRegex)) {
    const candidate = match[1]?.trim();
    if (!candidate) {
      continue;
    }

    sources.add(
      candidate.startsWith('<') && candidate.endsWith('>') ? candidate.slice(1, -1) : candidate,
    );
  }

  for (const match of markdown.matchAll(htmlImageRegex)) {
    const candidate = match[1]?.trim();
    if (candidate) {
      sources.add(candidate);
    }
  }

  return [...sources];
}

export function hasMarkdownDataImage(markdown: string): boolean {
  return (
    markdown.includes('![') && extractRenderableMarkdownImageSources(markdown).some(isImageDataUrl)
  );
}

export const IMAGE_DATA_URL_TRANSFORM: UrlTransform = (url, key, node) => {
  if (key === 'src' && node.tagName === 'img' && isImageDataUrl(url)) {
    return url;
  }

  return defaultUrlTransform(url);
};

export const DATA_IMAGE_ONLY_URL_TRANSFORM: UrlTransform = (url, key, node) => {
  if (key === 'src' && node.tagName === 'img') {
    return isImageDataUrl(url) ? url : '';
  }

  return defaultUrlTransform(url);
};
