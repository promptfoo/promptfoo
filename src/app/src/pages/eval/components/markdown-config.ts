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
  alt?: string;
  children?: MarkdownAstNode[];
  identifier?: string;
  position?: {
    start: { offset?: number };
    end: { offset?: number };
  };
  url?: string;
}

type MarkdownImageReference = {
  alt?: string;
  end: number;
  start: number;
} & ({ identifier: string; syntax: 'reference' } | { url: string; syntax: 'inline' });

export interface RenderableMarkdownImage {
  alt?: string;
  end: number;
  source: string;
  start: number;
  syntax: 'inline' | 'reference';
}

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

export function isInlineDataImage(image: RenderableMarkdownImage): boolean {
  return image.syntax === 'inline' && isImageDataUrl(image.source);
}

function visitMarkdownAst(node: MarkdownAstNode, visitor: (node: MarkdownAstNode) => void): void {
  visitor(node);
  node.children?.forEach((child) => visitMarkdownAst(child, visitor));
}

/**
 * Extract images that ReactMarkdown will parse, including their source ranges.
 *
 * Source ranges let the Markdown-off preview path replace only image tokens
 * while leaving all surrounding diagnostic text byte-for-byte literal.
 */
export function extractRenderableMarkdownImages(markdown: string): RenderableMarkdownImage[] {
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

    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (typeof start !== 'number' || typeof end !== 'number') {
      return;
    }

    if (node.type === 'image' && node.url) {
      images.push({ url: node.url, alt: node.alt, start, end, syntax: 'inline' });
    } else if (node.type === 'imageReference' && node.identifier) {
      images.push({
        identifier: node.identifier,
        alt: node.alt,
        start,
        end,
        syntax: 'reference',
      });
    }
  });

  const renderableImages: RenderableMarkdownImage[] = [];
  for (const image of images) {
    const source = 'url' in image ? image.url : definitions.get(image.identifier);
    if (source) {
      renderableImages.push({
        source,
        alt: image.alt,
        start: image.start,
        end: image.end,
        syntax: image.syntax,
      });
    }
  }

  return renderableImages;
}

/** Extract unique image sources using the same parsing semantics as ReactMarkdown. */
export function extractRenderableMarkdownImageSources(markdown: string): string[] {
  const sources = new Set(extractRenderableMarkdownImages(markdown).map((image) => image.source));
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
  return extractRenderableMarkdownImages(markdown).some((image) => isImageDataUrl(image.source));
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
