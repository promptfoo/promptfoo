import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DataImagePreviewText from './DataImagePreviewText';
import { extractRenderableMarkdownImages } from './markdown-config';

describe('DataImagePreviewText', () => {
  it('replaces only data-image tokens and preserves surrounding Markdown literally', () => {
    const dataUri = 'data:image/png;base64,AA==';
    const text = [
      '**literal emphasis**',
      '[diagnostic]: https://example.com/debug',
      `![Preview](${dataUri})`,
      '![Remote](https://attacker.example/collect)',
    ].join('\n');

    const { container } = render(
      <DataImagePreviewText text={text} images={extractRenderableMarkdownImages(text)} />,
    );

    expect(container).toHaveTextContent('**literal emphasis**');
    expect(container).toHaveTextContent('[diagnostic]: https://example.com/debug');
    expect(container).toHaveTextContent('![Remote](https://attacker.example/collect)');
    expect(screen.getByRole('img', { name: 'Preview' })).toHaveAttribute('src', dataUri);
  });

  it('leaves reference-style data images literal', () => {
    const text = ['![Preview][image]', '[image]: data:image/png;base64,AA=='].join('\n');

    const { container } = render(
      <DataImagePreviewText text={text} images={extractRenderableMarkdownImages(text)} />,
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container).toHaveTextContent('![Preview][image]');
    expect(container).toHaveTextContent('[image]: data:image/png;base64,AA==');
  });
});
