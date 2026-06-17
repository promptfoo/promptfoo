import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import MarkdownImage from './MarkdownImage';

describe('MarkdownImage', () => {
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

  it('renders a non-interactive image when no preview callback is provided', () => {
    render(<MarkdownImage src="data:image/png;base64,AA==" alt="Static chart" />);

    expect(screen.getByRole('img', { name: 'Static chart' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
