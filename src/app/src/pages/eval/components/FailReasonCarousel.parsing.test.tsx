import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import FailReasonCarousel from './FailReasonCarousel';
import * as markdownConfig from './markdown-config';

// Keep this large-input dispatch test independent of Markdown parsing cost under coverage.
// FailReasonCarousel.test.tsx exercises the same toggle with the real renderer and extractor.
vi.mock('react-markdown', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-markdown')>()),
  default: () => null,
}));

it('extracts a multi-megabyte failure reason only in forced-preview mode', () => {
  const reason = `![Preview](data:image/png;base64,${'AaBb'.repeat(512 * 1024)})`;
  const extract = vi.spyOn(markdownConfig, 'extractRenderableMarkdownImages').mockReturnValue([]);

  try {
    const { rerender } = render(
      <FailReasonCarousel failReasons={[reason]} renderMarkdown={true} />,
    );
    expect(extract.mock.calls.length).toBe(0);

    rerender(<FailReasonCarousel failReasons={[reason]} renderMarkdown={false} />);
    expect(extract.mock.calls.length).toBe(1);
    expect(extract.mock.calls[0][0] === reason).toBe(true);

    rerender(<FailReasonCarousel failReasons={[reason]} renderMarkdown={true} />);
    expect(extract.mock.calls.length).toBe(1);
    expect(extract.mock.calls[0][0] === reason).toBe(true);
  } finally {
    extract.mockRestore();
  }
});
