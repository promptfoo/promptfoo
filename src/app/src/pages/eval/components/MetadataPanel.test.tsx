import { renderWithProviders } from '@app/utils/testutils';
import { fireEvent, screen } from '@testing-library/react';
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

    renderWithProviders(<MetadataPanel {...defaultProps} metadata={mockMetadata} />);

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

    renderWithProviders(<MetadataPanel {...defaultProps} metadata={mockMetadata} />);

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

    renderWithProviders(
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

    renderWithProviders(
      <MetadataPanel {...defaultProps} metadata={mockMetadata} cloudConfig={mockCloudConfig} />,
    );

    const policyNameCell = screen.getByText('My Policy');
    expect(policyNameCell).toBeInTheDocument();
    expect(policyNameCell.closest('td')).toBeInTheDocument();
  });

  it('should return null when metadata is undefined', () => {
    const { container } = renderWithProviders(
      <MetadataPanel {...defaultProps} metadata={undefined} />,
    );
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

    renderWithProviders(<MetadataPanel {...defaultProps} metadata={mockMetadata} />);

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

    renderWithProviders(<MetadataPanel {...defaultProps} metadata={mockMetadata} />);

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

    const { rerender } = renderWithProviders(
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

    renderWithProviders(
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

    renderWithProviders(<MetadataPanel {...defaultProps} metadata={mockMetadata} />);

    const filterButton = screen.getByRole('button', { name: 'Filter by testField' });
    fireEvent.click(filterButton);

    expect(mockOnApplyFilter).toHaveBeenCalledWith('testField', 'testValue');
  });

  it('should return null when metadata is an empty object', () => {
    const mockMetadata = {};
    const { container } = renderWithProviders(
      <MetadataPanel {...defaultProps} metadata={mockMetadata} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('should correctly handle and render URLs with special characters that require URL encoding', () => {
    const urlWithSpecialChars =
      'https://example.com/path with spaces?query=value&other=value with !@#$%^&*()_+';
    const mockMetadata = {
      urlKey: urlWithSpecialChars,
    };

    renderWithProviders(<MetadataPanel {...defaultProps} metadata={mockMetadata} />);

    const linkElement = screen.getByRole('link', { name: urlWithSpecialChars });
    expect(linkElement).toBeInTheDocument();
    expect(linkElement).toHaveAttribute('href', urlWithSpecialChars);
  });

  it('should apply different word-break strategies to different content types', () => {
    const mockMetadata = {
      urlKey: 'https://www.example.com/verylongpath',
      stringKey: 'This is a long string',
    };

    renderWithProviders(<MetadataPanel {...defaultProps} metadata={mockMetadata} />);

    const urlCell = screen.getByText('https://www.example.com/verylongpath').closest('td');
    expect(urlCell).toHaveClass('break-all');

    const stringCell = screen.getByText('This is a long string').closest('td');
    expect(stringCell).toHaveClass('break-words');
  });

  it('should handle rendering in a very narrow container by applying word-break and overflow-wrap styles', () => {
    const longString = 'This is a very long string that should wrap. '.repeat(20);
    const mockMetadata = {
      longKey: longString,
    };

    renderWithProviders(
      <div style={{ width: '100px' }}>
        <MetadataPanel {...defaultProps} metadata={mockMetadata} />
      </div>,
    );

    const tableCell = screen
      .getByText((content) => content?.includes(longString.substring(0, 20)))
      .closest('td');

    expect(tableCell).toBeInTheDocument();
    // Tailwind uses 'break-words' class for word-break: break-word
    expect(tableCell).toHaveClass('break-words');
  });

  it('should handle deeply nested JSON objects by wrapping the text within the table cell', () => {
    const nestedJsonObject = {
      level1: {
        level2: {
          level3: {
            level4: {
              level5: {
                level6: 'This is a very long string to force wrapping. '.repeat(20),
              },
            },
          },
        },
      },
    };

    const mockMetadata = {
      nestedObjectKey: nestedJsonObject,
    };

    renderWithProviders(<MetadataPanel {...defaultProps} metadata={mockMetadata} />);

    const stringifiedJson = JSON.stringify(nestedJsonObject);
    const tableCell = screen.getByText(new RegExp(`^${stringifiedJson.slice(0, 50)}`), {
      selector: 'td',
    });

    expect(tableCell).toBeInTheDocument();
    // Tailwind uses 'break-words' class for word-break: break-word
    expect(tableCell).toHaveClass('break-words');
  });

  it('should render long non-URL metadata values with word-break and overflow-wrap styles', () => {
    const longJsonString = JSON.stringify({
      key1: 'This is a very long string. '.repeat(50),
      key2: 123,
      key3: { nestedKey: 'Another long string. '.repeat(50) },
    });

    const mockMetadata = {
      longJsonKey: longJsonString,
    };

    renderWithProviders(<MetadataPanel {...defaultProps} metadata={mockMetadata} />);

    const valueCell = screen.getByText((content) => {
      return (
        typeof content === 'string' &&
        content.startsWith('{"key1":"This is a very long string.') &&
        content.endsWith('...')
      );
    });

    expect(valueCell).toBeInTheDocument();

    const tableCell = valueCell.closest('td');
    // Tailwind uses 'break-words' class for word-break: break-word
    expect(tableCell).toHaveClass('break-words');
  });

  it('should render long URL values in a way that wraps the text within the table cell, preventing horizontal scrolling, and the cell should have the correct word-break and overflow-wrap styles applied', () => {
    const longUrl = 'https://www.example.com/very/long/path/to/resource?query=a'.repeat(10);
    const mockMetadata = {
      longUrlKey: longUrl,
    };

    renderWithProviders(<MetadataPanel {...defaultProps} metadata={mockMetadata} />);

    const linkElement = screen.getByRole('link', { name: longUrl });
    expect(linkElement).toBeInTheDocument();

    const tableCell = linkElement.closest('td');
    // Tailwind uses 'break-all' class for word-break: break-all
    expect(tableCell).toHaveClass('break-all');
  });
});
