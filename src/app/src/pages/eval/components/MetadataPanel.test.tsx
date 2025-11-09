import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MetadataPanel } from './MetadataPanel';
import type { ExpandedMetadataState } from './MetadataPanel';

describe('MetadataPanel', () => {
  const mockOnMetadataClick = vi.fn();
  const mockOnCopy = vi.fn();
  const mockOnApplyFilter = vi.fn();

  const defaultProps = {
    expandedMetadata: {} as ExpandedMetadataState,
    copiedFields: {},
    onMetadataClick: mockOnMetadataClick,
    onCopy: mockOnCopy,
    onApplyFilter: mockOnApplyFilter,
  };

  it('should filter out metadata keys present in HIDDEN_METADATA_KEYS, including newly added keys', () => {
    const mockMetadata = {
      stringKey: 'stringValue',
      citations: [{ source: 'doc1', content: 'citation content' }],
      _promptfooFileMetadata: { fileName: 'test.txt', size: 1024 },
      newHiddenKey: 'hiddenValue',
    };

    vi.mock('@app/constants', () => {
      return {
        HIDDEN_METADATA_KEYS: ['citations', '_promptfooFileMetadata', 'newHiddenKey'],
      };
    });

    render(<MetadataPanel {...defaultProps} metadata={mockMetadata} />);

    expect(screen.getByText('Key')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
    expect(screen.getByText('stringKey')).toBeInTheDocument();
    expect(screen.getByText('stringValue')).toBeInTheDocument();

    expect(screen.queryByText('citations')).not.toBeInTheDocument();
    expect(screen.queryByText('_promptfooFileMetadata')).not.toBeInTheDocument();
    expect(screen.queryByText('newHiddenKey')).not.toBeInTheDocument();

    vi.restoreAllMocks();
  });

  it('should handle malformed URLs by rendering them as plain text instead of a link', () => {
    const malformedUrl = 'http://';
    const mockMetadata = {
      malformedUrlKey: malformedUrl,
    };

    render(<MetadataPanel {...defaultProps} metadata={mockMetadata} />);

    expect(screen.getByText(malformedUrl)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: malformedUrl })).not.toBeInTheDocument();
  });

  it("should render a 'View policy in Promptfoo Cloud' link in the value cell for 'policyName' when metadata contains both 'policyName' and a valid reusable 'policyId', and cloudConfig is enabled with an appUrl", () => {
    const mockMetadata = {
      policyName: 'My Policy',
      policyId: '550e8400-e29b-41d4-a716-446655440000',
    };

    const mockCloudConfig = {
      isEnabled: true,
      appUrl: 'https://cloud.promptfoo.com',
    };

    render(
      <MetadataPanel {...defaultProps} metadata={mockMetadata} cloudConfig={mockCloudConfig} />,
    );

    const linkElement = screen.getByRole('link', {
      name: /view policy in promptfoo cloud/i,
    });
    expect(linkElement).toBeInTheDocument();
    expect(linkElement).toHaveAttribute(
      'href',
      'https://cloud.promptfoo.com/redteam/plugins/policies/550e8400-e29b-41d4-a716-446655440000',
    );
    expect(linkElement).toHaveAttribute('target', '_blank');
    expect(linkElement).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it("should render the value for 'policyName' as plain text when cloudConfig is enabled and has an appUrl, but metadata does not contain a valid 'policyId'", () => {
    const mockMetadata = {
      policyName: 'My Policy',
    };

    const mockCloudConfig = {
      isEnabled: true,
      appUrl: 'https://example.com',
    };

    render(
      <MetadataPanel {...defaultProps} metadata={mockMetadata} cloudConfig={mockCloudConfig} />,
    );

    const policyNameCell = screen.getByText('My Policy');
    expect(policyNameCell).toBeInTheDocument();
    expect(policyNameCell.closest('td')).toBeInTheDocument();
  });

  it('should return null when metadata is undefined', () => {
    const { container } = render(<MetadataPanel {...defaultProps} metadata={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("should render a table with all metadata keys except 'citations' and '_promptfooFileMetadata' when metadata is provided", () => {
    const mockMetadata = {
      stringKey: 'stringValue',
      numberKey: 123,
      objectKey: { nested: 'value' },
      citations: [{ source: 'doc1', content: 'citation content' }],
      _promptfooFileMetadata: { fileName: 'test.txt', size: 1024 },
    };

    render(<MetadataPanel {...defaultProps} metadata={mockMetadata} />);

    expect(screen.getByText('Key')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();

    expect(screen.getByText('stringKey')).toBeInTheDocument();
    expect(screen.getByText('stringValue')).toBeInTheDocument();

    expect(screen.getByText('numberKey')).toBeInTheDocument();
    expect(screen.getByText('123')).toBeInTheDocument();

    expect(screen.getByText('objectKey')).toBeInTheDocument();
    expect(screen.getByText(JSON.stringify(mockMetadata.objectKey))).toBeInTheDocument();

    // Verify hidden metadata keys are not displayed
    expect(screen.queryByText('citations')).not.toBeInTheDocument();
    expect(screen.queryByText('_promptfooFileMetadata')).not.toBeInTheDocument();
  });

  it('should render a metadata value as a Link when the value is a valid URL string', () => {
    const mockMetadata = {
      urlKey: 'https://www.example.com',
    };

    render(<MetadataPanel {...defaultProps} metadata={mockMetadata} />);

    const linkElement = screen.getByRole('link', { name: 'https://www.example.com' });
    expect(linkElement).toBeInTheDocument();
    expect(linkElement).toHaveAttribute('href', 'https://www.example.com');
  });

  it('should display a truncated value for long metadata strings and expand on click', () => {
    const longString = 'This is a very long string. '.repeat(50);
    const mockMetadata = {
      longKey: longString,
    };

    const mockExpandedMetadata: ExpandedMetadataState = {
      longKey: { expanded: false, lastClickTime: 0 },
    };

    const { rerender } = render(
      <MetadataPanel
        {...defaultProps}
        metadata={mockMetadata}
        expandedMetadata={mockExpandedMetadata}
      />,
    );

    const truncatedValue = screen.getByText((content) => content.endsWith('...'));
    expect(truncatedValue).toBeInTheDocument();
    expect(truncatedValue.textContent?.length).toBeLessThanOrEqual(300);

    fireEvent.click(truncatedValue);

    const updatedExpandedMetadata: ExpandedMetadataState = {
      longKey: { expanded: true, lastClickTime: Date.now() },
    };

    rerender(
      <MetadataPanel
        {...defaultProps}
        metadata={mockMetadata}
        expandedMetadata={updatedExpandedMetadata}
      />,
    );

    const fullValue = screen.getByText((content) => content?.includes(longString.substring(0, 50)));
    expect(fullValue).toBeInTheDocument();
  });

  it('should call onCopy with the correct key and value when the copy icon is clicked, and show a checkmark icon if the field is marked as copied', () => {
    const mockMetadata = {
      testKey: 'testValue',
    };

    const mockCopiedFields = {
      testKey: true,
    };

    render(
      <MetadataPanel {...defaultProps} metadata={mockMetadata} copiedFields={mockCopiedFields} />,
    );

    const copyButton = screen.getByRole('button', { name: 'Copy metadata value for testKey' });
    fireEvent.click(copyButton);

    expect(mockOnCopy).toHaveBeenCalledWith('testKey', 'testValue');
  });

  it('should call onApplyFilter with the correct field and value when the filter icon is clicked', () => {
    const mockMetadata = {
      testField: 'testValue',
    };

    render(<MetadataPanel {...defaultProps} metadata={mockMetadata} />);

    const filterButton = screen.getByRole('button', { name: 'Filter by testField' });
    fireEvent.click(filterButton);

    expect(mockOnApplyFilter).toHaveBeenCalledWith('testField', 'testValue');
  });

  it('should return null when metadata is an empty object', () => {
    const mockMetadata = {};
    const { container } = render(<MetadataPanel {...defaultProps} metadata={mockMetadata} />);
    expect(container.firstChild).toBeNull();
  });

  it('should correctly handle and render URLs with special characters that require URL encoding', () => {
    const urlWithSpecialChars =
      'https://example.com/path with spaces?query=value&other=value with !@#$%^&*()_+';
    const mockMetadata = {
      urlKey: urlWithSpecialChars,
    };

    render(<MetadataPanel {...defaultProps} metadata={mockMetadata} />);

    const linkElement = screen.getByRole('link', { name: urlWithSpecialChars });
    expect(linkElement).toBeInTheDocument();
    expect(linkElement).toHaveAttribute('href', urlWithSpecialChars);
  });
});
