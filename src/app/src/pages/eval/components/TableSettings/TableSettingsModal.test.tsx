import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import TableSettingsModal from './TableSettingsModal';
import { useSettingsState } from '../../hooks/useSettingsState';

vi.mock('../../hooks/useSettingsState', () => ({
  useSettingsState: vi.fn(),
}));

vi.mock('./components/SettingsPanel', () => ({
  default: () => <div data-testid="mock-settings-panel"></div>,
}));

vi.mock('@mui/material/useMediaQuery', () => ({
  default: vi.fn(() => true),
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
    const closeButton = screen.getByRole('button', { name: 'close' });
    fireEvent.click(closeButton);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should call resetToDefaults when the "Reset to Defaults" button is clicked', () => {
    render(<TableSettingsModal open={true} onClose={mockOnClose} />);

    const resetButton = screen.getByRole('button', { name: 'Reset settings to defaults' });
    fireEvent.click(resetButton);

    expect(mockResetToDefaults).toHaveBeenCalled();
  });

  it.each([
    { hasChanges: true, expectedButtonText: 'Save Changes' },
    { hasChanges: false, expectedButtonText: 'Done' },
  ])(
    'should display "$expectedButtonText" when hasChanges is $hasChanges',
    ({ hasChanges, expectedButtonText }) => {
      mockSettingsState(hasChanges);
      render(<TableSettingsModal open={true} onClose={mockOnClose} />);
      expect(screen.getByRole('button', { name: expectedButtonText })).toBeInTheDocument();
    },
  );

  it('should call useSettingsState with the correct initial open state', () => {
    render(<TableSettingsModal open={true} onClose={mockOnClose} />);
    expect(useSettingsState).toHaveBeenCalledWith(true);
  });

  it.each([
    { hasChanges: true, buttonText: 'Save Changes' },
    { hasChanges: false, buttonText: 'Done' },
  ])(
    'should call onClose when the main action button ($buttonText) is clicked',
    ({ hasChanges, buttonText }) => {
      mockSettingsState(hasChanges);
      render(<TableSettingsModal open={true} onClose={mockOnClose} />);
      const mainActionButton = screen.getByRole('button', { name: buttonText });
      fireEvent.click(mainActionButton);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    },
  );

  it('should render the dialog in full screen mode when isMobile is true', () => {
    render(<TableSettingsModal open={true} onClose={mockOnClose} />);

    const dialog = screen.getByRole('dialog');

    expect(dialog).toHaveClass('MuiDialog-paperFullScreen');
  });

  it('should call the onClose callback when the modal is closed unexpectedly with unsaved changes', () => {
    mockSettingsState(true);

    render(<TableSettingsModal open={true} onClose={mockOnClose} />);

    const closeButton = screen.getByRole('button', { name: 'close' });
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
