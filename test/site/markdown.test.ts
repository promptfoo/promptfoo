import { sanitizeMarkdown } from '../../site/src/utils/markdown';

describe('sanitizeMarkdown', () => {
  const sampleMarkdown = `---
title: Test Document
author: Test Author
---

# Main Title

This is a paragraph with ![an image](image.jpg) and some text.

<!-- This is a comment -->

<div style="color: red;">Styled content</div>

\`\`\`javascript
console.log('code block');
\`\`\`

Here's some \`inline code\` and a [link](https://example.com).

<img src="test.jpg" alt="HTML image" />



Multiple newlines above.
`;

  it('should sanitize markdown with sane defaults', () => {
    const result = sanitizeMarkdown(sampleMarkdown);

    // Should remove frontmatter
    expect(result).not.toContain('---');
    expect(result).not.toContain('title: Test Document');
    expect(result).not.toContain('author: Test Author');

    // Should remove images
    expect(result).not.toContain('![an image](image.jpg)');
    expect(result).not.toContain('<img src="test.jpg"');

    // Should remove HTML comments
    expect(result).not.toContain('<!-- This is a comment -->');

    // Should remove styled divs but preserve content
    expect(result).not.toContain('<div style="color: red;">');
    expect(result).toContain('Styled content');

    // Should preserve code blocks and links (sane defaults)
    expect(result).toContain('console.log');
    expect(result).toContain('```javascript');
    expect(result).toContain('`inline code`');
    expect(result).toContain('[link](https://example.com)');

    // Should normalize whitespace
    expect(result).not.toMatch(/\n\n\n/);
    expect(result).toMatch(/^# Main Title/); // Should be trimmed
  });

  it('should handle empty string', () => {
    expect(sanitizeMarkdown('')).toBe('');
  });

  it('should handle null/undefined input', () => {
    expect(sanitizeMarkdown(null as any)).toBe('');
    expect(sanitizeMarkdown(undefined as any)).toBe('');
  });

  it('should handle non-string input', () => {
    expect(sanitizeMarkdown(123 as any)).toBe('');
  });

  it('should handle TOML frontmatter', () => {
    const tomlMarkdown = `+++
title = "Test"
+++

# Content`;
    const result = sanitizeMarkdown(tomlMarkdown);
    expect(result).not.toContain('+++');
    expect(result).not.toContain('title = "Test"');
    expect(result).toContain('# Content');
  });

  it('should preserve markdown formatting', () => {
    const formattedMarkdown = `# Heading

**Bold text** and *italic text*

- List item 1
- List item 2

> Blockquote`;

    const result = sanitizeMarkdown(formattedMarkdown);
    expect(result).toContain('# Heading');
    expect(result).toContain('**Bold text**');
    expect(result).toContain('*italic text*');
    expect(result).toContain('- List item 1');
    expect(result).toContain('> Blockquote');
  });
});
