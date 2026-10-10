import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsState } from './hooks/useSettingsState';
import TableSettingsModal from './TableSettingsModal';

vi.mock('./hooks/useSettingsState', () => ({
  useSettingsState: vi.fn(),
}));

vi.mock('./components/SettingsPanel', () => ({
  default: () => <div data-testid="mock-settings-panel"></div>,
}));

describe('TableSettingsModal', () => {
  const mockOnClose = vi.fn();
  const mockResetToDefaults = vi.fn();
  const mockOnResultsTableZoomChange = vi.fn();
  const defaultProps = {
    open: true,
    onClose: mockOnClose,
    resultsTableZoom: 1,
    onResultsTableZoomChange: mockOnResultsTableZoomChange,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useSettingsState).mockReturnValue({ resetToDefaults: mockResetToDefaults });
  });

  it("should not render the settings dialog when 'open' is false", () => {
    render(<TableSettingsModal {...defaultProps} open={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Table Settings')).not.toBeInTheDocument();
  });

  it("should render the settings dialog when 'open' is true", () => {
    render(<TableSettingsModal {...defaultProps} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Table Settings')).toBeInTheDocument();
  });

  it('should call the onClose callback when the close button is clicked', async () => {
    const user = userEvent.setup();
    render(<TableSettingsModal {...defaultProps} />);
    const closeButton = screen.getByRole('button', { name: 'Close' });
    await user.click(closeButton);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should call resetToDefaults when the "Reset to Defaults" button is clicked', async () => {
    const user = userEvent.setup();
    render(<TableSettingsModal {...defaultProps} />);

    const resetButton = screen.getByRole('button', { name: 'Reset settings to defaults' });
    await user.click(resetButton);

    expect(mockResetToDefaults).toHaveBeenCalled();
    expect(mockOnResultsTableZoomChange).toHaveBeenCalledWith(1);
  });

  it('should display "Done" button', () => {
    render(<TableSettingsModal {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('should call onClose when the Done button is clicked', async () => {
    const user = userEvent.setup();
    render(<TableSettingsModal {...defaultProps} />);
    const mainActionButton = screen.getByRole('button', { name: 'Done' });
    await user.click(mainActionButton);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should render the dialog with proper sizing', () => {
    render(<TableSettingsModal {...defaultProps} />);

    const dialog = screen.getByRole('dialog');

    // The dialog uses Radix UI with Tailwind classes for sizing
    expect(dialog).toHaveClass('max-h-[90vh]', 'max-w-[680px]', 'flex-col');
  });

  it('keeps the settings body scrollable while the footer stays visible', () => {
    render(<TableSettingsModal {...defaultProps} />);

    const settingsPanel = screen.getByTestId('mock-settings-panel');
    expect(settingsPanel.parentElement).toHaveClass('min-h-0', 'overflow-y-auto');
    expect(screen.getByRole('button', { name: 'Done' }).closest('div')).toHaveClass('shrink-0');
  });

  it('should handle prop changes while the modal is open', () => {
    const { rerender } = render(<TableSettingsModal {...defaultProps} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    rerender(<TableSettingsModal {...defaultProps} open={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
