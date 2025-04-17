import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import Citations from './Citations';

describe('Citations component', () => {
  // Mock clipboard API
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renders nothing when citations is null or empty array', () => {
    const { container: container1 } = render(<Citations citations={null} />);
    expect(container1.firstChild).toBeNull();

    const { container: container2 } = render(<Citations citations={[]} />);
    expect(container2.firstChild).toBeNull();
  });

  it('renders a single Bedrock Knowledge Base citation correctly', () => {
    const bedrockCitation = {
      retrievedReferences: [
        {
          content: { text: 'This is citation content from Bedrock' },
          location: {
            type: 'web',
            s3Location: { uri: 'https://example.com/page1' },
          },
        },
      ],
    };

    render(<Citations citations={bedrockCitation} />);

    // Check heading
    expect(screen.getByText('Citations')).toBeInTheDocument();
    expect(screen.getByText('(1)')).toBeInTheDocument();

    // Check source
    expect(screen.getByText('example.com')).toBeInTheDocument();

    // Check content
    expect(screen.getByText('This is citation content from Bedrock')).toBeInTheDocument();
  });

  it('renders multiple citations correctly', () => {
    const multipleCitations = [
      {
        retrievedReferences: [
          {
            content: { text: 'Citation 1 content' },
            location: { s3Location: { uri: 'https://example.com/page1' } },
          },
        ],
      },
      {
        retrievedReferences: [
          {
            content: { text: 'Citation 2 content' },
            location: { s3Location: { uri: 'https://example.com/page2' } },
          },
        ],
      },
    ];

    render(<Citations citations={multipleCitations} />);

    // Check count
    expect(screen.getByText('(2)')).toBeInTheDocument();

    // Check both contents are present
    expect(screen.getByText('Citation 1 content')).toBeInTheDocument();
    expect(screen.getByText('Citation 2 content')).toBeInTheDocument();
  });

  it('handles Anthropic citation format correctly', () => {
    const anthropicCitation = {
      source: {
        title: 'Anthropic Documentation',
        url: 'https://anthropic.com/docs',
      },
      quote: 'This is a quote from Anthropic documentation',
    };

    render(<Citations citations={anthropicCitation} />);

    // Check source
    expect(screen.getByText('anthropic.com')).toBeInTheDocument();

    // Check content
    expect(screen.getByText('This is a quote from Anthropic documentation')).toBeInTheDocument();
  });

  it('handles citations with only minimal data', () => {
    const minimalCitation = {
      source: 'Some unknown source',
      content: 'Minimal citation content',
    };

    render(<Citations citations={minimalCitation} />);

    // Check source
    expect(screen.getByText('Some unknown source')).toBeInTheDocument();

    // Check content
    expect(screen.getByText('Minimal citation content')).toBeInTheDocument();
  });

  it('extracts source type correctly from different sources', () => {
    const mixedCitations = [
      { source: 'https://example.com/page', content: 'Web content' },
      { source: 's3://bucket/key', content: 'S3 content' },
      { source: 'file:///path/to/file', content: 'File content' },
      { source: 'Source type: custom', content: 'Custom type content' },
      { source: 'Unknown format source', content: 'Default content' },
    ];

    render(<Citations citations={mixedCitations} />);

    // Use getAllByText for sources that appear in the chip labels
    expect(screen.getByText('example.com')).toBeInTheDocument();

    // Check for the content text which is unique for each citation
    expect(screen.getByText('S3 content')).toBeInTheDocument();
    expect(screen.getByText('File content')).toBeInTheDocument();
    expect(screen.getByText('Custom type content')).toBeInTheDocument();
    expect(screen.getByText('Default content')).toBeInTheDocument();
  });

  it('copies citation content to clipboard when copy button is clicked', async () => {
    const citation = { source: 'Test Source', content: 'Test content to copy' };

    render(<Citations citations={citation} />);

    const copyButton = screen.getByLabelText('Copy citation content 1');
    await userEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Test content to copy');

    // Should show check icon after copying
    expect(screen.getByTestId('CheckIcon')).toBeInTheDocument();
  });

  it('renders clickable links for URL sources', () => {
    const citation = {
      source: 'https://example.com/document',
      content: 'Content with URL source',
    };

    render(<Citations citations={citation} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.com/document');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('handles raw citation strings by converting to objects', () => {
    const rawTextCitation = 'This is just a raw text citation';

    render(<Citations citations={rawTextCitation} />);

    // Use getAllByText since "Unknown source" might appear multiple times
    expect(screen.getAllByText('Unknown source')[0]).toBeInTheDocument();
    expect(screen.getByText('This is just a raw text citation')).toBeInTheDocument();
  });

  it('renders complex nested citation references correctly', () => {
    const nestedCitation = {
      retrievedReferences: [
        {
          content: { text: 'First reference' },
          location: { s3Location: { uri: 'https://example.com/1' } },
        },
        {
          content: { text: 'Second reference' },
          location: { s3Location: { uri: 'https://example.com/2' } },
        },
      ],
    };

    render(<Citations citations={nestedCitation} />);

    // Should process both nested references
    expect(screen.getByText('First reference')).toBeInTheDocument();
    expect(screen.getByText('Second reference')).toBeInTheDocument();
  });

  it('handles citations with missing or null source/content gracefully', () => {
    const incompleteCitations = [
      { content: 'Content without source' },
      { source: 'Source without content' },
      {}, // Empty object
    ];

    render(<Citations citations={incompleteCitations} />);

    // Use getAllByText since the fallback text appears multiple times
    expect(screen.getByText('Content without source')).toBeInTheDocument();
    expect(screen.getAllByText('Unknown source')[0]).toBeInTheDocument();
    expect(screen.getByText('Source without content')).toBeInTheDocument();
    expect(screen.getByText('{}')).toBeInTheDocument(); // Empty object stringified
  });

  it('calls setTimeout when copying citation content', async () => {
    // Create a spy for window.setTimeout
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

    const citation = { source: 'Test', content: 'Content to copy' };

    render(<Citations citations={citation} />);

    // Click copy button
    const copyButton = screen.getByLabelText('Copy citation content 1');
    await userEvent.click(copyButton);

    // Verify that setTimeout was called
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);

    // Restore the original
    setTimeoutSpy.mockRestore();
  });
});
