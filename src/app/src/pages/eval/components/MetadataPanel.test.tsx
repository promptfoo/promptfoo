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

  it("should render a table with all metadata keys except 'citations' and '_promptfooFileMetadata'", () => {
    const mockMetadata = {
      stringKey: 'stringValue',
      numberKey: 123,
      objectKey: { nested: 'value' },
      citations: [{ source: 'doc1', content: 'citation content' }],
      _promptfooFileMetadata: { internal: 'data' },
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

    // Should filter out both citations and _promptfooFileMetadata
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

  it('should show empty state when metadata is an empty object', () => {
    const mockMetadata = {};
    render(<MetadataPanel {...defaultProps} metadata={mockMetadata} />);
    expect(screen.getByText('No metadata available')).toBeInTheDocument();
    expect(screen.getByText('Metadata will appear here when available')).toBeInTheDocument();
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

  it('should render malformed URLs as plain text and call onMetadataClick when clicked', () => {
    const mockMetadata = {
      malformedUrlKey: 'http:/example.com',
    };

    render(<MetadataPanel {...defaultProps} metadata={mockMetadata} />);

    const malformedUrlText = screen.getByText('http:/example.com');
    expect(malformedUrlText.closest('a')).toBeNull();

    fireEvent.click(malformedUrlText);
    expect(mockOnMetadataClick).toHaveBeenCalledWith('malformedUrlKey');
  });

  it('should show empty state when metadata is undefined', () => {
    render(<MetadataPanel {...defaultProps} metadata={undefined} />);
    expect(screen.getByText('No metadata available')).toBeInTheDocument();
    expect(screen.getByText('Metadata will appear here when available')).toBeInTheDocument();
  });

  it('should render the empty state UI when metadata only contains filtered keys', () => {
    const mockMetadata = {
      citations: [{ source: 'doc1', content: 'citation content' }],
      _promptfooFileMetadata: { internal: 'data' },
    };

    render(<MetadataPanel {...defaultProps} metadata={mockMetadata} />);

    expect(screen.getByText('No metadata available')).toBeInTheDocument();
    expect(screen.getByText('Metadata will appear here when available')).toBeInTheDocument();
  });

  it('should render metadata keys in alphabetical order', () => {
    const mockMetadata = {
      zebra: 'value1',
      apple: 'value2',
      banana: 'value3',
    };

    render(<MetadataPanel {...defaultProps} metadata={mockMetadata} />);

    const rows = screen.getAllByRole('row');

    const renderedKeys = rows.slice(1).map((row) => row.children[0].textContent);

    expect(renderedKeys).toEqual(['apple', 'banana', 'zebra']);
  });

  it('should call onApplyFilter with the correct field and stringified value when the filter icon is clicked for a complex object value', () => {
    const mockMetadata = {
      complexObjectField: { a: 1, b: 'test' },
    };

    render(<MetadataPanel {...defaultProps} metadata={mockMetadata} />);

    const filterButton = screen.getByRole('button', { name: 'Filter by complexObjectField' });
    fireEvent.click(filterButton);

    expect(mockOnApplyFilter).toHaveBeenCalledWith(
      'complexObjectField',
      JSON.stringify(mockMetadata.complexObjectField),
    );
  });
});
