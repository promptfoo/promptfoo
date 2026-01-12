import { useState } from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  const mockSettingsState = (hasChanges: boolean) => {
    vi.mocked(useSettingsState).mockReturnValue({
      hasChanges,
      resetToDefaults: mockResetToDefaults,
      store: {} as any,
      localMaxTextLength: 500,
      setLocalMaxTextLength: vi.fn(),
      handleSliderChange: vi.fn(),
      handleSliderChangeCommitted: vi.fn(),
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockSettingsState(false);
  });

  it("should not render the settings dialog when 'open' is false", () => {
    render(<TableSettingsModal open={false} onClose={mockOnClose} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Table Settings')).not.toBeInTheDocument();
  });

  it("should render the settings dialog when 'open' is true", () => {
    render(<TableSettingsModal open={true} onClose={mockOnClose} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Table Settings')).toBeInTheDocument();
  });

  it('should call the onClose callback when the close button is clicked', () => {
    render(<TableSettingsModal open={true} onClose={mockOnClose} />);
    const closeButton = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeButton);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should call resetToDefaults when the "Reset to Defaults" button is clicked', () => {
    render(<TableSettingsModal open={true} onClose={mockOnClose} />);

    const resetButton = screen.getByRole('button', { name: 'Reset settings to defaults' });
    fireEvent.click(resetButton);

    expect(mockResetToDefaults).toHaveBeenCalled();
  });

  it('should display "Done" button', () => {
    render(<TableSettingsModal open={true} onClose={mockOnClose} />);
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('should call useSettingsState with the correct initial open state', () => {
    render(<TableSettingsModal open={true} onClose={mockOnClose} />);
    expect(useSettingsState).toHaveBeenCalledWith(true);
  });

  it('should call onClose when the Done button is clicked', () => {
    render(<TableSettingsModal open={true} onClose={mockOnClose} />);
    const mainActionButton = screen.getByRole('button', { name: 'Done' });
    fireEvent.click(mainActionButton);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should render the dialog with proper sizing', () => {
    render(<TableSettingsModal open={true} onClose={mockOnClose} />);

    const dialog = screen.getByRole('dialog');

    // The dialog uses Radix UI with Tailwind classes for sizing
    expect(dialog).toHaveClass('max-w-[680px]');
  });

  it('should call the onClose callback when the modal is closed unexpectedly with unsaved changes', () => {
    mockSettingsState(true);

    render(<TableSettingsModal open={true} onClose={mockOnClose} />);

    const closeButton = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should handle prop changes while the modal is open', async () => {
    const TestComponent = () => {
      const [isOpen, setIsOpen] = useState(true);

      setTimeout(() => {
        setIsOpen(false);
      }, 50);

      return <TableSettingsModal open={isOpen} onClose={mockOnClose} />;
    };

    render(<TestComponent />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await waitFor(
      () => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      },
      { timeout: 300 },
    );
  });
});
