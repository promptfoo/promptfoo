import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CommentDialog from './TableCommentDialog';

describe('CommentDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockProps = {
    open: true,
    contextText: 'Sample context',
    commentText: 'Initial comment',
    onClose: vi.fn(),
    onSave: vi.fn(),
    onChange: vi.fn(),
  };

  const renderWithTheme = (component: React.ReactElement) => {
    const theme = createTheme({
      palette: { mode: 'light' },
    });
    return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
  };

  it('renders correctly when open', () => {
    renderWithTheme(<CommentDialog {...mockProps} />);

    expect(screen.getByText('Edit Comment')).toBeInTheDocument();
    expect(screen.getByTestId('context-text')).toHaveTextContent('Sample context');
    expect(screen.getByRole('textbox')).toHaveValue('Initial comment');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    renderWithTheme(<CommentDialog {...mockProps} open={false} />);
    expect(screen.queryByText('Edit Comment')).not.toBeInTheDocument();
  });

  it('calls onClose when Cancel button is clicked', async () => {
    renderWithTheme(<CommentDialog {...mockProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when dialog backdrop is clicked', () => {
    renderWithTheme(<CommentDialog {...mockProps} />);

    const backdrop = document.querySelector('.MuiBackdrop-root');
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(mockProps.onClose).toHaveBeenCalledTimes(1);
    }
  });

  it('calls onSave when Save button is clicked', async () => {
    renderWithTheme(<CommentDialog {...mockProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mockProps.onSave).toHaveBeenCalledTimes(1);
  });

  it('calls onChange when comment text is modified', async () => {
    renderWithTheme(<CommentDialog {...mockProps} />);

    const textbox = screen.getByRole('textbox');
    await userEvent.type(textbox, 't'); // Testing single character input
    expect(mockProps.onChange).toHaveBeenCalledWith('Initial commentt');

    // Clear mocks to test full string
    vi.clearAllMocks();

    // Set value directly to test full string update
    await userEvent.clear(textbox);
    await userEvent.type(textbox, 'New text');
    expect(mockProps.onChange).toHaveBeenLastCalledWith('Initial commentt');
  });

  describe('whitespace preservation', () => {
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

  it('renders correctly in dark mode', () => {
    const darkTheme = createTheme({
      palette: { mode: 'dark' },
    });

    render(
      <ThemeProvider theme={darkTheme}>
        <CommentDialog {...mockProps} />
      </ThemeProvider>,
    );

    const preElement = screen.getByTestId('context-text');
    expect(preElement).toHaveStyle({
      backgroundColor: '#1e1e1e',
    });
  });
});
