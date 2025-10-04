import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createTestQueryClient, createQueryClientWrapper } from '../../../test/queryClientWrapper';
import { MetadataPanel } from './MetadataPanel';
import type { ExpandedMetadataState } from './MetadataPanel';

vi.mock('@app/hooks/useCloudConfig', () => ({
  default: () => ({ data: null, isLoading: false, error: null, refetch: vi.fn() }),
}));

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

  it("should render a table with all metadata keys except 'citations' when metadata is provided", () => {
    const mockMetadata = {
      stringKey: 'stringValue',
      numberKey: 123,
      objectKey: { nested: 'value' },
      citations: [{ source: 'doc1', content: 'citation content' }],
    };

    const queryClient = createTestQueryClient();
    render(<MetadataPanel {...defaultProps} metadata={mockMetadata} />, {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    expect(screen.getByText('Key')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();

    expect(screen.getByText('stringKey')).toBeInTheDocument();
    expect(screen.getByText('stringValue')).toBeInTheDocument();

    expect(screen.getByText('numberKey')).toBeInTheDocument();
    expect(screen.getByText('123')).toBeInTheDocument();

    expect(screen.getByText('objectKey')).toBeInTheDocument();
    expect(screen.getByText(JSON.stringify(mockMetadata.objectKey))).toBeInTheDocument();

    expect(screen.queryByText('citations')).not.toBeInTheDocument();
  });

  it('should render a metadata value as a Link when the value is a valid URL string', () => {
    const mockMetadata = {
      urlKey: 'https://www.example.com',
    };

    const queryClient = createTestQueryClient();
    render(<MetadataPanel {...defaultProps} metadata={mockMetadata} />, {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

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

    const queryClient = createTestQueryClient();
    const { rerender } = render(
      <MetadataPanel
        {...defaultProps}
        metadata={mockMetadata}
        expandedMetadata={mockExpandedMetadata}
      />,
      {
        wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
      },
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

    const queryClient = createTestQueryClient();
    render(
      <MetadataPanel {...defaultProps} metadata={mockMetadata} copiedFields={mockCopiedFields} />,
      {
        wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
      },
    );

    const copyButton = screen.getByRole('button', { name: 'Copy metadata value for testKey' });
    fireEvent.click(copyButton);

    expect(mockOnCopy).toHaveBeenCalledWith('testKey', 'testValue');
  });

  it('should call onApplyFilter with the correct field and value when the filter icon is clicked', () => {
    const mockMetadata = {
      testField: 'testValue',
    };

    const queryClient = createTestQueryClient();
    render(<MetadataPanel {...defaultProps} metadata={mockMetadata} />, {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    const filterButton = screen.getByRole('button', { name: 'Filter by testField' });
    fireEvent.click(filterButton);

    expect(mockOnApplyFilter).toHaveBeenCalledWith('testField', 'testValue');
  });

  it('should return null when metadata is an empty object', () => {
    const mockMetadata = {};
    const queryClient = createTestQueryClient();
    const { container } = render(<MetadataPanel {...defaultProps} metadata={mockMetadata} />, {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });
    expect(container.firstChild).toBeNull();
  });

  it('should correctly handle and render URLs with special characters that require URL encoding', () => {
    const urlWithSpecialChars =
      'https://example.com/path with spaces?query=value&other=value with !@#$%^&*()_+';
    const mockMetadata = {
      urlKey: urlWithSpecialChars,
    };

    const queryClient = createTestQueryClient();
    render(<MetadataPanel {...defaultProps} metadata={mockMetadata} />, {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    const linkElement = screen.getByRole('link', { name: urlWithSpecialChars });
    expect(linkElement).toBeInTheDocument();
    expect(linkElement).toHaveAttribute('href', urlWithSpecialChars);
  });
});
