import { renderWithProviders } from '@app/utils/testutils';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReportSettingsDialogButton from './ReportSettingsDialogButton';
import { useReportStore } from './store';

vi.mock('./store');
const mockUseReportStore = vi.mocked(useReportStore);

describe('ReportSettingsDialogButton', () => {
  const mockSetShowPercentagesOnRiskCards = vi.fn();
  const mockSetPluginPassRateThreshold = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseReportStore.mockReturnValue({
      showPercentagesOnRiskCards: false,
      setShowPercentagesOnRiskCards: mockSetShowPercentagesOnRiskCards,
      pluginPassRateThreshold: 1.0,
      setPluginPassRateThreshold: mockSetPluginPassRateThreshold,
    });
  });

  it("should open the settings dialog with the title 'Report Settings' when the icon button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportSettingsDialogButton />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const settingsButton = screen.getByLabelText('settings');
    await user.click(settingsButton);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    expect(within(dialog).getByRole('heading', { name: 'Report Settings' })).toBeInTheDocument();
  });

  it('should call setPluginPassRateThreshold with the new value when the slider is moved', async () => {
    const user = userEvent.setup();
    mockUseReportStore.mockReturnValue({
      showPercentagesOnRiskCards: false,
      setShowPercentagesOnRiskCards: mockSetShowPercentagesOnRiskCards,
      pluginPassRateThreshold: 0.5,
      setPluginPassRateThreshold: mockSetPluginPassRateThreshold,
    });
    renderWithProviders(<ReportSettingsDialogButton />);

    const settingsButton = screen.getByLabelText('settings');
    await user.click(settingsButton);

    const slider = screen.getByRole('slider');

    // Simulate changing the slider value directly via fireEvent
    fireEvent.change(slider, { target: { value: '0.75' } });

    expect(mockSetPluginPassRateThreshold).toHaveBeenCalled();
    const calls = mockSetPluginPassRateThreshold.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    if (calls.length > 0) {
      const lastCallValue = calls.pop()?.[0];
      expect(typeof lastCallValue).toBe('number');
      expect(lastCallValue).toBeGreaterThan(0.5);
    }
  });

  it('should close the settings dialog when the Close button is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportSettingsDialogButton />);

    const settingsButton = screen.getByLabelText('settings');
    await user.click(settingsButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Get the Close button in the dialog footer (there's also an X close button)
    const closeButtons = screen.getAllByRole('button', { name: 'Close' });
    // The footer Close button is the one with text, not the X icon
    const closeButton = closeButtons.find((btn) => btn.textContent === 'Close');
    await user.click(closeButton!);

    // Dialog should be closed after clicking Close
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should display the current pluginPassRateThreshold value as a percentage in the dialog label', async () => {
    const user = userEvent.setup();
    const threshold = 0.75;
    mockUseReportStore.mockReturnValue({
      showPercentagesOnRiskCards: false,
      setShowPercentagesOnRiskCards: mockSetShowPercentagesOnRiskCards,
      pluginPassRateThreshold: threshold,
      setPluginPassRateThreshold: mockSetPluginPassRateThreshold,
    });

    renderWithProviders(<ReportSettingsDialogButton />);

    const settingsButton = screen.getByLabelText('settings');
    await user.click(settingsButton);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    // Label and value are now in separate elements
    expect(within(dialog).getByText('Plugin Pass Rate Threshold')).toBeInTheDocument();
    expect(within(dialog).getByText(`${(threshold * 100).toFixed(0)}%`)).toBeInTheDocument();
  });

  it('should display "NaN%" when pluginPassRateThreshold is NaN', async () => {
    mockUseReportStore.mockReturnValue({
      showPercentagesOnRiskCards: false,
      setShowPercentagesOnRiskCards: mockSetShowPercentagesOnRiskCards,
      pluginPassRateThreshold: NaN,
      setPluginPassRateThreshold: mockSetPluginPassRateThreshold,
    });

    const user = userEvent.setup();
    renderWithProviders(<ReportSettingsDialogButton />);

    const settingsButton = screen.getByLabelText('settings');
    await user.click(settingsButton);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    // Label and value are now in separate elements
    expect(within(dialog).getByText('Plugin Pass Rate Threshold')).toBeInTheDocument();
    expect(within(dialog).getByText('NaN%')).toBeInTheDocument();
  });

  it('should render the "Show percentages on risk cards" checkbox based on the store value (unchecked)', async () => {
    const user = userEvent.setup();
    mockUseReportStore.mockReturnValue({
      showPercentagesOnRiskCards: false,
      setShowPercentagesOnRiskCards: mockSetShowPercentagesOnRiskCards,
      pluginPassRateThreshold: 1.0,
      setPluginPassRateThreshold: mockSetPluginPassRateThreshold,
    });
    renderWithProviders(<ReportSettingsDialogButton />);

    const settingsButton = screen.getByLabelText('settings');
    await user.click(settingsButton);

    // Radix UI Checkbox uses data-state attribute instead of checked property
    const checkbox = screen.getByRole('checkbox', {
      name: 'Show percentages on risk cards',
    });
    expect(checkbox).toHaveAttribute('data-state', 'unchecked');
  });

  it('should render the "Show percentages on risk cards" checkbox based on the store value (checked)', async () => {
    const user = userEvent.setup();
    mockUseReportStore.mockReturnValue({
      showPercentagesOnRiskCards: true,
      setShowPercentagesOnRiskCards: mockSetShowPercentagesOnRiskCards,
      pluginPassRateThreshold: 1.0,
      setPluginPassRateThreshold: mockSetPluginPassRateThreshold,
    });
    renderWithProviders(<ReportSettingsDialogButton />);

    const settingsButton = screen.getByLabelText('settings');
    await user.click(settingsButton);

    // Radix UI Checkbox uses data-state attribute instead of checked property
    const checkbox = screen.getByRole('checkbox', {
      name: 'Show percentages on risk cards',
    });
    expect(checkbox).toHaveAttribute('data-state', 'checked');
  });
});
