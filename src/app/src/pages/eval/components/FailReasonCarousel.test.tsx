import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import FailReasonCarousel from './FailReasonCarousel';

describe('FailReasonCarousel', () => {
  it('supports changing from an empty reason list to a populated one', () => {
    const { rerender } = render(<FailReasonCarousel failReasons={[]} renderMarkdown={false} />);

    expect(screen.queryByText('Failure reason')).not.toBeInTheDocument();

    rerender(<FailReasonCarousel failReasons={['Failure reason']} renderMarkdown={false} />);

    expect(screen.getByText('Failure reason')).toBeInTheDocument();
  });

  it('keeps the selected reason in range when the list shrinks', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <FailReasonCarousel
        failReasons={['First reason', 'Second reason', 'Third reason']}
        renderMarkdown={false}
      />,
    );

    const nextButton = screen.getAllByRole('button')[1];
    await user.click(nextButton);
    await user.click(nextButton);
    expect(screen.getByText('Third reason')).toBeInTheDocument();

    rerender(<FailReasonCarousel failReasons={['First reason']} renderMarkdown={false} />);

    expect(screen.getByText('First reason')).toBeInTheDocument();
  });

  it('preserves literal failure diagnostics when Markdown rendering is disabled', () => {
    const reason = `${String.raw`\d+\.\w+`}\n[diagnostic]: https://example.com`;

    const { container } = render(
      <FailReasonCarousel failReasons={[reason]} renderMarkdown={false} />,
    );

    const renderedReason = container.querySelector('.fail-reason');
    expect(renderedReason).toHaveTextContent(String.raw`\d+\.\w+`);
    expect(renderedReason).toHaveTextContent('[diagnostic]: https://example.com');
  });

  it.each([
    ['remote', '![probe](https://attacker.example/collect)'],
    ['relative', '![screenshot](./failure.png)'],
    ['unsafe-scheme', '![probe](javascript:alert%281%29)'],
  ])('renders blocked %s image sources as literal text', (_label, reason) => {
    const { container } = render(
      <FailReasonCarousel failReasons={[reason]} renderMarkdown={true} />,
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container).toHaveTextContent(reason);
  });

  it.each([
    '![probe](https://attacker.example/collect "secret diagnostic")',
    "![probe](./failure.png 'single quoted diagnostic')",
    '![probe](javascript:alert%281%29 (parenthesized diagnostic))',
    String.raw`![probe](./failure.png "diagnostic \"quoted\" text")`,
  ])('preserves the complete blocked image token: %s', (reason) => {
    const { container } = render(
      <FailReasonCarousel failReasons={[`  ${reason}  `]} renderMarkdown={true} />,
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.textContent).toBe(reason);
  });

  it.each([true, false])(
    'preserves data-image titles with Markdown enabled=%s',
    (renderMarkdown) => {
      render(
        <FailReasonCarousel
          failReasons={['![Actual image](data:image/png;base64,AA== "diagnostic title")']}
          renderMarkdown={renderMarkdown}
        />,
      );

      expect(screen.getByRole('img', { name: 'Actual image' })).toHaveAttribute(
        'title',
        'diagnostic title',
      );
    },
  );

  it('preserves the resolved title of a blocked reference image', () => {
    const reason = [
      '![probe][image]',
      '',
      '[image]: https://attacker.example/collect "reference diagnostic"',
    ].join('\n');
    const { container } = render(
      <FailReasonCarousel failReasons={[reason]} renderMarkdown={true} />,
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container).toHaveTextContent(
      '![probe](https://attacker.example/collect "reference diagnostic")',
    );
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

  it('leaves a linked image under the enclosing link’s control', () => {
    const onImageClick = vi.fn();
    const { container } = render(
      <FailReasonCarousel
        failReasons={['[![Linked image](data:image/png;base64,AA==)](#details)']}
        renderMarkdown={true}
        onImageClick={onImageClick}
      />,
    );

    const image = screen.getByRole('img', { name: 'Linked image' });
    expect(image.closest('a')).toHaveAttribute('href', '#details');
    expect(container.querySelector('a button')).not.toBeInTheDocument();
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    fireEvent(image, click);
    expect(click.defaultPrevented).toBe(false);
    expect(onImageClick).not.toHaveBeenCalled();
  });

  it('keeps surrounding diagnostics literal when forcing a data-image preview', () => {
    const dataUri = 'data:image/png;base64,AA==';
    const reason = [
      '**literal emphasis**',
      '[diagnostic]: https://example.com/debug',
      `![Actual image](${dataUri})`,
    ].join('\n');

    const { container } = render(
      <FailReasonCarousel failReasons={[reason]} renderMarkdown={false} />,
    );

    expect(container).toHaveTextContent('**literal emphasis**');
    expect(container).toHaveTextContent('[diagnostic]: https://example.com/debug');
    expect(container.querySelector('strong')).not.toBeInTheDocument();
    expect(container.querySelector('a')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Actual image' })).toHaveAttribute('src', dataUri);
  });

  it('does not force previews for reference-style data images', () => {
    const reason = ['![Preview][image]', '[image]: data:image/png;base64,AA=='].join('\n');

    const { container } = render(
      <FailReasonCarousel failReasons={[reason]} renderMarkdown={false} />,
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container).toHaveTextContent('![Preview][image]');
    expect(container).toHaveTextContent('[image]: data:image/png;base64,AA==');
  });
});
