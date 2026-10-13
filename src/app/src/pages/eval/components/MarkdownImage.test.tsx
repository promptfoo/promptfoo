import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import MarkdownImage, { MarkdownImageLink } from './MarkdownImage';

describe('MarkdownImage', () => {
  it.each([undefined, ''])('preserves alt text when the image source is %s', (src) => {
    const onImageClick = vi.fn();
    render(<MarkdownImage src={src} alt="request screenshot" onImageClick={onImageClick} />);

    expect(screen.getByText('request screenshot')).toBeVisible();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(onImageClick).not.toHaveBeenCalled();
  });

  it.each([undefined, ''])('renders nothing for a missing source and alt text %s', (alt) => {
    const { container } = render(<MarkdownImage alt={alt} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('opens image previews with the keyboard', async () => {
    const user = userEvent.setup();
    const onImageClick = vi.fn();
    render(
      <MarkdownImage
        src="data:image/png;base64,AA=="
        alt="Generated chart"
        onImageClick={onImageClick}
      />,
    );

    const trigger = screen.getByRole('button', {
      name: 'Open image preview: Generated chart',
    });
    trigger.focus();
    await user.keyboard('{Enter}');

    expect(onImageClick).toHaveBeenCalledWith('data:image/png;base64,AA==');
  });

  it('keeps linked images keyboard navigable without opening a preview', async () => {
    const user = userEvent.setup();
    const onImageClick = vi.fn();
    const onLinkClick = vi.fn();
    render(
      <MarkdownImageLink href="#details" title="Read details">
        <em>
          <MarkdownImage
            src="data:image/png;base64,AA=="
            alt="Linked chart"
            onImageClick={onImageClick}
          />
        </em>
      </MarkdownImageLink>,
    );

    const link = screen.getByRole('link', { name: 'Linked chart' });
    link.addEventListener('click', onLinkClick);
    expect(link).toHaveAttribute('href', '#details');
    expect(link).toHaveAttribute('title', 'Read details');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    await user.tab();
    expect(link).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(onLinkClick).toHaveBeenCalledOnce();
    expect(onLinkClick.mock.calls[0][0].defaultPrevented).toBe(false);
    expect(onImageClick).not.toHaveBeenCalled();
  });

  it('renders a non-interactive image when no preview callback is provided', () => {
    render(
      <MarkdownImage
        src="data:image/png;base64,AA=="
        alt="Static chart"
        title="Chart details"
        className="max-h-48"
      />,
    );

    const image = screen.getByRole('img', { name: 'Static chart' });
    expect(image).toHaveAttribute('src', 'data:image/png;base64,AA==');
    expect(image).toHaveAttribute('title', 'Chart details');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveClass('max-h-48');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
