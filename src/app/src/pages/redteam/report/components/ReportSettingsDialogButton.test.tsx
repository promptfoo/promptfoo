import { render, screen, within, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    render(<ReportSettingsDialogButton />);

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
    render(<ReportSettingsDialogButton />);

    const settingsButton = screen.getByLabelText('settings');
    await user.click(settingsButton);

    const slider = screen.getByRole('slider');

    await user.click(slider);
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');

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
    render(<ReportSettingsDialogButton />);

    const settingsButton = screen.getByLabelText('settings');
    await user.click(settingsButton);

    const dialog = screen.getByRole('dialog');

    const closeButton = screen.getByRole('button', { name: 'Close' });
    await user.click(closeButton);

    await waitForElementToBeRemoved(dialog);

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

    render(<ReportSettingsDialogButton />);

    const settingsButton = screen.getByLabelText('settings');
    await user.click(settingsButton);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    const label = within(dialog).getByText(
      `Plugin Pass Rate Threshold: ${(threshold * 100).toFixed(0)}%`,
    );
    expect(label).toBeInTheDocument();
  });

  it('should display "NaN%" when pluginPassRateThreshold is NaN', async () => {
    mockUseReportStore.mockReturnValue({
      showPercentagesOnRiskCards: false,
      setShowPercentagesOnRiskCards: mockSetShowPercentagesOnRiskCards,
      pluginPassRateThreshold: NaN,
      setPluginPassRateThreshold: mockSetPluginPassRateThreshold,
    });

    const user = userEvent.setup();
    render(<ReportSettingsDialogButton />);

    const settingsButton = screen.getByLabelText('settings');
    await user.click(settingsButton);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    const label = within(dialog).getByText(/Plugin Pass Rate Threshold/);
    expect(label).toHaveTextContent('Plugin Pass Rate Threshold: NaN%');
  });

  it('should render the "Show percentages on risk cards" checkbox based on the store value (unchecked)', async () => {
    const user = userEvent.setup();
    mockUseReportStore.mockReturnValue({
      showPercentagesOnRiskCards: false,
      setShowPercentagesOnRiskCards: mockSetShowPercentagesOnRiskCards,
      pluginPassRateThreshold: 1.0,
      setPluginPassRateThreshold: mockSetPluginPassRateThreshold,
    });
    render(<ReportSettingsDialogButton />);

    const settingsButton = screen.getByLabelText('settings');
    await user.click(settingsButton);

    const checkbox = screen.getByLabelText('Show percentages on risk cards') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it('should render the "Show percentages on risk cards" checkbox based on the store value (checked)', async () => {
    const user = userEvent.setup();
    mockUseReportStore.mockReturnValue({
      showPercentagesOnRiskCards: true,
      setShowPercentagesOnRiskCards: mockSetShowPercentagesOnRiskCards,
      pluginPassRateThreshold: 1.0,
      setPluginPassRateThreshold: mockSetPluginPassRateThreshold,
    });
    render(<ReportSettingsDialogButton />);

    const settingsButton = screen.getByLabelText('settings');
    await user.click(settingsButton);

    const checkbox = screen.getByLabelText('Show percentages on risk cards') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });
});
