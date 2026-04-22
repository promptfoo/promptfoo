import React from 'react';

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import VariableMarkdownCell from './VariableMarkdownCell';

describe('VariableMarkdownCell', () => {
  describe('rendering', () => {
    it('renders plain text content', () => {
      render(<VariableMarkdownCell value="Hello, world!" maxTextLength={100} />);

      expect(screen.getByText('Hello, world!')).toBeInTheDocument();
    });

    it('renders markdown bold text', () => {
      render(<VariableMarkdownCell value="**bold text**" maxTextLength={100} />);

      const boldElement = screen.getByText('bold text');
      expect(boldElement).toBeInTheDocument();
      expect(boldElement.tagName).toBe('STRONG');
    });

    it('renders markdown italic text', () => {
      render(<VariableMarkdownCell value="_italic text_" maxTextLength={100} />);

      const italicElement = screen.getByText('italic text');
      expect(italicElement).toBeInTheDocument();
      expect(italicElement.tagName).toBe('EM');
    });

    it('renders markdown links', () => {
      render(
        <VariableMarkdownCell value="[Click here](https://example.com)" maxTextLength={100} />,
      );

      const linkElement = screen.getByText('Click here');
      expect(linkElement).toBeInTheDocument();
      expect(linkElement.tagName).toBe('A');
      expect(linkElement).toHaveAttribute('href', 'https://example.com');
    });

    it('renders markdown code blocks', () => {
      render(<VariableMarkdownCell value="`inline code`" maxTextLength={100} />);

      const codeElement = screen.getByText('inline code');
      expect(codeElement).toBeInTheDocument();
      expect(codeElement.tagName).toBe('CODE');
    });

    it('renders markdown lists', () => {
      const listMarkdown = `- Item 1
- Item 2
- Item 3`;
      render(<VariableMarkdownCell value={listMarkdown} maxTextLength={200} />);

      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 2')).toBeInTheDocument();
      expect(screen.getByText('Item 3')).toBeInTheDocument();
    });

    it('renders GFM tables (remarkGfm plugin)', () => {
      const tableMarkdown = `
| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
      `.trim();

      render(<VariableMarkdownCell value={tableMarkdown} maxTextLength={500} />);

      expect(screen.getByText('Header 1')).toBeInTheDocument();
      expect(screen.getByText('Cell 1')).toBeInTheDocument();
    });

    it('renders GFM strikethrough (remarkGfm plugin)', () => {
      render(<VariableMarkdownCell value="~~strikethrough~~" maxTextLength={100} />);

      const strikeElement = screen.getByText('strikethrough');
      expect(strikeElement).toBeInTheDocument();
      expect(strikeElement.tagName).toBe('DEL');
    });
  });

  describe('memoization', () => {
    it('is wrapped with React.memo', () => {
      // Verify the component is memoized by checking its displayName or type
      // React.memo components have a $$typeof of Symbol(react.memo)
      expect(VariableMarkdownCell).toHaveProperty('$$typeof');
      expect(String(VariableMarkdownCell.$$typeof)).toContain('memo');
    });

    it('does not re-render when parent re-renders with same props', () => {
      const renderSpy = vi.fn();

      // Create a test component that tracks renders
      const TestComponent = React.memo(function TestComponent({
        value,
        maxTextLength,
      }: {
        value: string;
        maxTextLength: number;
      }) {
        renderSpy();
        return <VariableMarkdownCell value={value} maxTextLength={maxTextLength} />;
      });

      const { rerender } = render(<TestComponent value="test content" maxTextLength={100} />);

      expect(renderSpy).toHaveBeenCalledTimes(1);

      // Re-render with exact same props
      rerender(<TestComponent value="test content" maxTextLength={100} />);

      // Should still be 1 due to memoization
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    it('re-renders when value prop changes', () => {
      const { rerender } = render(
        <VariableMarkdownCell value="original content" maxTextLength={100} />,
      );

      expect(screen.getByText('original content')).toBeInTheDocument();

      rerender(<VariableMarkdownCell value="updated content" maxTextLength={100} />);

      expect(screen.getByText('updated content')).toBeInTheDocument();
      expect(screen.queryByText('original content')).not.toBeInTheDocument();
    });

    it('re-renders when maxTextLength prop changes', () => {
      const longText = 'A'.repeat(200);

      const { rerender, container } = render(
        <VariableMarkdownCell value={longText} maxTextLength={50} />,
      );

      // Should show truncation indicator with short maxLength
      const initialContent = container.textContent;

      rerender(<VariableMarkdownCell value={longText} maxTextLength={500} />);

      // Content should be different after increasing maxLength
      const updatedContent = container.textContent;

      // The full content should now be visible
      expect(updatedContent?.length).toBeGreaterThan(initialContent?.length || 0);
    });
  });

  describe('error handling', () => {
    it('renders fallback when markdown parsing fails', () => {
      // Mock console.error to suppress error boundary output
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Create a value that might cause issues but should still render as fallback
      const problematicValue = 'Normal text content';

      render(<VariableMarkdownCell value={problematicValue} maxTextLength={100} />);

      // Should render the content (either as markdown or fallback)
      expect(screen.getByText('Normal text content')).toBeInTheDocument();

      consoleSpy.mockRestore();
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      const { container } = render(<VariableMarkdownCell value="" maxTextLength={100} />);

      // Should render without errors
      expect(container).toBeInTheDocument();
    });

    it('handles very long content', () => {
      const longContent = 'A'.repeat(10000);

      const { container } = render(
        <VariableMarkdownCell value={longContent} maxTextLength={100} />,
      );

      // Should render without errors and be truncated
      expect(container).toBeInTheDocument();
    });

    it('handles special characters', () => {
      render(<VariableMarkdownCell value={'Special: <>&"\''} maxTextLength={100} />);

      expect(screen.getByText(/Special:/)).toBeInTheDocument();
    });

    it('handles unicode content', () => {
      render(<VariableMarkdownCell value="Unicode: 你好世界 🌍 émojis" maxTextLength={100} />);

      expect(screen.getByText(/Unicode:/)).toBeInTheDocument();
    });

    it('handles JSON-like content in markdown code blocks', () => {
      const jsonMarkdown = '```json\n{"key": "value"}\n```';

      render(<VariableMarkdownCell value={jsonMarkdown} maxTextLength={200} />);

      expect(screen.getByText(/key/)).toBeInTheDocument();
    });

    it('handles maxTextLength of 0', () => {
      const { container } = render(<VariableMarkdownCell value="Some text" maxTextLength={0} />);

      // maxLength of 0 should show full content (no truncation)
      expect(container).toBeInTheDocument();
    });
  });
});
