import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it.each(['before', 'after'])('truncates literal text %s inline previews', async (position) => {
    const user = userEvent.setup();
    const source = `data:image/png;base64,${'AaBb'.repeat(100)}`;
    const literal = `**literal** ${'diagnostic '.repeat(100)}`;
    const token = `![Preview](${source})`;
    const text = position === 'before' ? `${literal}\n${token}` : `${token}\n${literal}`;
    const { container } = render(
      <DataImagePreviewText
        text={text}
        images={extractRenderableMarkdownImages(text)}
        maxTextLength={40}
      />,
    );

    expect(container.textContent!.length).toBeLessThan(60);
    if (position === 'before') {
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    } else {
      expect(screen.getByRole('img', { name: 'Preview' })).toHaveAttribute('src', source);
    }
    await user.click(screen.getByText('...'));
    expect(container).toHaveTextContent(literal.trim());
    expect(screen.getByRole('img', { name: 'Preview' })).toHaveAttribute('src', source);
    expect(container.querySelector('strong')).not.toBeInTheDocument();
    await user.click(screen.getByText('Show less'));
    expect(container.textContent!.length).toBeLessThan(60);
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
