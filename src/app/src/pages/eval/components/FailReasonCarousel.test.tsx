import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import FailReasonCarousel from './FailReasonCarousel';

describe('FailReasonCarousel', () => {
  it('preserves literal failure diagnostics when Markdown rendering is disabled', () => {
    const reason = `${String.raw`\d+\.\w+`}\n[diagnostic]: https://example.com`;

    const { container } = render(
      <FailReasonCarousel failReasons={[reason]} renderMarkdown={false} />,
    );

    const renderedReason = container.querySelector('.fail-reason');
    expect(renderedReason).toHaveTextContent(String.raw`\d+\.\w+`);
    expect(renderedReason).toHaveTextContent('[diagnostic]: https://example.com');
  });

  it('does not render remote image sources from failure reasons', () => {
    render(
      <FailReasonCarousel
        failReasons={['![probe](https://attacker.example/collect)']}
        renderMarkdown={true}
      />,
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders data images and forwards clicks to the lightbox callback', async () => {
    const user = userEvent.setup();
    const onImageClick = vi.fn();
    const dataUri =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    render(
      <FailReasonCarousel
        failReasons={[`Expected image to match\n![Actual image](${dataUri})`]}
        renderMarkdown={false}
        onImageClick={onImageClick}
      />,
    );

    const image = screen.getByRole('img', { name: 'Actual image' });
    expect(image).toHaveAttribute('src', dataUri);

    await user.click(image);

    expect(onImageClick).toHaveBeenCalledWith(dataUri);
  });
});
