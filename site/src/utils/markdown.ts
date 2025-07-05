/**
 * Sanitizes markdown content by removing elements that shouldn't be served via APIs
 * or processed by other tools. Removes frontmatter, images, HTML comments, and
 * styled divs while preserving the main content.
 *
 * @param markdown - The raw markdown content to sanitize
 * @returns The sanitized markdown content
 *
 * @example
 * ```typescript
 * const cleanMarkdown = sanitizeMarkdown(rawContent);
 * ```
 */
export function sanitizeMarkdown(markdown: string): string {
  if (!markdown || typeof markdown !== 'string') {
    return '';
  }

  let output = markdown;

  // Remove frontmatter (YAML/TOML between --- or +++ delimiters)
  output = output.replace(/^---[\s\S]*?---\s*/m, '');
  output = output.replace(/^\+\+\+[\s\S]*?\+\+\+\s*/m, '');

  // Remove HTML comments
  output = output.replace(/<!--[\s\S]*?-->/g, '');

  // Remove markdown image syntax: ![alt](url)
  output = output.replace(/!\[[^\]]*\]\([^)]*\)/g, '');

  // Remove HTML img tags
  output = output.replace(/<img[^>]*\/?>/gi, '');

  // Remove divs with style attributes but preserve content
  output = output.replace(/<div[^>]*style=[^>]*>([\s\S]*?)<\/div>/gi, '$1');

  // Normalize whitespace
  output = output.replace(/[ \t]+$/gm, ''); // Remove trailing whitespace
  output = output.replace(/\n{3,}/g, '\n\n'); // Collapse multiple newlines to max 2
  output = output.trim(); // Remove leading/trailing whitespace

  return output;
}
