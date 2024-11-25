import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { describe, it, expect } from 'vitest';
import CommentDialog from './TableCommentDialog';

describe('CommentDialog', () => {
  const mockProps = {
    open: true,
    contextText: '',
    commentText: '',
    onClose: () => {},
    onSave: () => {},
    onChange: () => {},
  };

  const renderWithTheme = (component: React.ReactElement) => {
    const theme = createTheme();
    return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
  };

  it('preserves whitespace in contextText', () => {
    const textWithWhitespace = `First line
    Indented line
        Double indented line
Last line with    multiple spaces`;

    renderWithTheme(<CommentDialog {...mockProps} contextText={textWithWhitespace} />);

    const preElement = screen.getByTestId('context-text');
    const styles = window.getComputedStyle(preElement);

    expect(preElement).toBeInTheDocument();
    expect(styles.whiteSpace).toBe('pre-wrap');
    expect(preElement.textContent?.trim()).toBe(textWithWhitespace);
  });

  it('handles multiple consecutive spaces', () => {
    const textWithSpaces = 'Multiple    spaces    here';

    renderWithTheme(<CommentDialog {...mockProps} contextText={textWithSpaces} />);

    const preElement = screen.getByTestId('context-text');
    expect(preElement.textContent?.trim()).toBe(textWithSpaces);
  });

  it('handles tabs and newlines', () => {
    const textWithTabs = 'Line1\n\tTabbed\n\t\tDouble tabbed';

    renderWithTheme(<CommentDialog {...mockProps} contextText={textWithTabs} />);

    const preElement = screen.getByTestId('context-text');
    expect(preElement.textContent?.trim()).toBe(textWithTabs);
  });
});
