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
const IMAGE_DATA_URL_HEADER =
  /^\s*data:(?:image\/[a-z0-9!#$%&'*+.^_`|~-]+|application\/octet-stream)(?:;[^,]*)?,/i;

interface MarkdownAstNode {
  type: string;
  alt?: string;
  title?: string | null;
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
} & (
  | { identifier: string; syntax: 'reference' }
  | { url: string; title?: string | null; syntax: 'inline' }
);

export interface RenderableMarkdownImage {
  alt?: string;
  title?: string;
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
  // Require a complete image MIME header, without validating or copying the payload.
  return IMAGE_DATA_URL_HEADER.test(url);
}

export function isInlineDataImage(image: RenderableMarkdownImage): boolean {
  return image.syntax === 'inline' && isImageDataUrl(image.source);
}

function visitMarkdownAst(
  node: MarkdownAstNode,
  visitor: (node: MarkdownAstNode) => undefined | false,
): void {
  if (visitor(node) === false) {
    return;
  }
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

  const definitions = new Map<string, { url: string; title?: string | null }>();
  const footnotes = new Map<string, MarkdownAstNode>();
  const referencedFootnotes = new Set<string>();
  const images: MarkdownImageReference[] = [];
  const tree = MARKDOWN_PARSER.parse(markdown) as MarkdownAstNode;

  // Match mdast-to-hast: definitions are global and the first definition wins,
  // even when its destination is empty or it occurs inside an unused footnote.
  visitMarkdownAst(tree, (node) => {
    if (!node.identifier) {
      return;
    }
    const identifier = node.identifier.toUpperCase();
    if (node.type === 'definition' && typeof node.url === 'string') {
      if (!definitions.has(identifier)) {
        definitions.set(identifier, { url: node.url, title: node.title });
      }
    } else if (node.type === 'footnoteDefinition' && !footnotes.has(identifier)) {
      footnotes.set(identifier, node);
    }
  });

  const collectImages = (node: MarkdownAstNode): undefined | false => {
    // Footnotes only render when reached from a reference, not at their source location.
    if (node.type === 'footnoteDefinition') {
      return false;
    }
    if (node.type === 'footnoteReference' && node.identifier) {
      referencedFootnotes.add(node.identifier.toUpperCase());
    }

    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (typeof start !== 'number' || typeof end !== 'number') {
      return;
    }

    if (node.type === 'image' && node.url) {
      images.push({
        url: node.url,
        alt: node.alt,
        title: node.title,
        start,
        end,
        syntax: 'inline',
      });
    } else if (node.type === 'imageReference' && node.identifier) {
      images.push({
        identifier: node.identifier.toUpperCase(),
        alt: node.alt,
        start,
        end,
        syntax: 'reference',
      });
    }
  };
  visitMarkdownAst(tree, collectImages);
  // Set iteration includes newly reached footnotes, but processes each key once,
  // so transitive references render and repeated/self/cyclic references terminate.
  for (const identifier of referencedFootnotes) {
    footnotes.get(identifier)?.children?.forEach((child) => visitMarkdownAst(child, collectImages));
  }
  // Forced previews splice source ranges, which must retain document order even
  // though the renderer moves referenced footnotes to the end of the document.
  images.sort((left, right) => left.start - right.start);

  const renderableImages: RenderableMarkdownImage[] = [];
  for (const image of images) {
    const definition = 'url' in image ? image : definitions.get(image.identifier);
    const source = definition?.url;
    if (source) {
      renderableImages.push({
        source,
        alt: image.alt,
        title: definition?.title ?? undefined,
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

/** Apply the same URL policy when detecting images and rendering them with ReactMarkdown. */
export function getMarkdownImageUrl(url: string): string {
  return isImageDataUrl(url) ? url : defaultUrlTransform(url);
}

export const IMAGE_DATA_URL_TRANSFORM: UrlTransform = (url, key, node) => {
  if (key === 'src' && node.tagName === 'img') {
    return getMarkdownImageUrl(url);
  }

  return defaultUrlTransform(url);
};

export const DATA_IMAGE_ONLY_URL_TRANSFORM: UrlTransform = (url, key, node) => {
  if (key === 'src' && node.tagName === 'img') {
    return isImageDataUrl(url) ? url : '';
  }

  return defaultUrlTransform(url);
};

/** Preserve image sources for custom renderers while sanitizing every other URL. */
export const PRESERVE_IMAGE_URL_TRANSFORM: UrlTransform = (url, key, node) => {
  if (key === 'src' && node.tagName === 'img') {
    return url;
  }

  return defaultUrlTransform(url);
};
