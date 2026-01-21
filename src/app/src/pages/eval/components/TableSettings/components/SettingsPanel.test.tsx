import { renderWithProviders } from '@app/utils/testutils';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useResultsViewSettingsStore } from '../../store';
import SettingsPanel from './SettingsPanel';

vi.mock('../../store', () => ({
  useResultsViewSettingsStore: vi.fn(),
}));

const mockedUseResultsViewSettingsStore = vi.mocked(useResultsViewSettingsStore);

describe('SettingsPanel', () => {
  const mockStore = {
    stickyHeader: true,
    setStickyHeader: vi.fn(),
    showPrompts: false,
    setShowPrompts: vi.fn(),
    showPassFail: true,
    setShowPassFail: vi.fn(),
    showPassReasons: false,
    setShowPassReasons: vi.fn(),
    showInferenceDetails: true,
    setShowInferenceDetails: vi.fn(),
    maxTextLength: 500,
    setMaxTextLength: vi.fn(),
    renderMarkdown: false,
    setRenderMarkdown: vi.fn(),
    prettifyJson: false,
    setPrettifyJson: vi.fn(),
    maxImageWidth: 256,
    setMaxImageWidth: vi.fn(),
    maxImageHeight: 256,
    setMaxImageHeight: vi.fn(),
    wordBreak: 'break-word',
    setWordBreak: vi.fn(),
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseResultsViewSettingsStore.mockReturnValue(mockStore);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    {
      name: 'Sticky header',
      initialState: true,
      setter: 'setStickyHeader' as const,
      expectedNewValue: false,
    },
    {
      name: 'Full prompts',
      initialState: false,
      setter: 'setShowPrompts' as const,
      expectedNewValue: true,
    },
    {
      name: 'Pass/fail indicators',
      initialState: true,
      setter: 'setShowPassFail' as const,
      expectedNewValue: false,
    },
    {
      name: 'Inference details',
      initialState: true,
      setter: 'setShowInferenceDetails' as const,
      expectedNewValue: false,
    },
    {
      name: 'Render Markdown',
      initialState: false,
      setter: 'setRenderMarkdown' as const,
      expectedNewValue: true,
    },
    {
      name: 'Force line breaks',
      initialState: false,
      setter: 'setWordBreak' as const,
      expectedNewValue: 'break-all',
    },
  ])('should update the $setter setting when the "$name" toggle is clicked', ({
    name,
    initialState,
    setter,
    expectedNewValue,
  }) => {
    renderWithProviders(<SettingsPanel />);

    const toggle = screen.getByRole('checkbox', { name });
    expect(toggle).toBeInTheDocument();

    if (initialState) {
      expect(toggle).toBeChecked();
    } else {
      expect(toggle).not.toBeChecked();
    }

    fireEvent.click(toggle);

    expect(mockStore[setter]).toHaveBeenCalledTimes(1);
    expect(mockStore[setter]).toHaveBeenCalledWith(expectedNewValue);
  });

  it('should call setMaxTextLength when slider value is committed via keyboard', async () => {
    renderWithProviders(<SettingsPanel />);

    const slider = screen.getByRole('slider', { name: /max text length/i });
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveAttribute('aria-valuenow', '500');

    // Focus the slider and use keyboard to change value
    slider.focus();
    // Pressing End key in Radix Slider goes to max value (1001)
    fireEvent.keyDown(slider, { key: 'End' });

    // For Radix Slider, the store is called via onValueCommit after key events
    expect(mockStore.setMaxTextLength).toHaveBeenCalledWith(Number.POSITIVE_INFINITY);
  });

  it('should set maxTextLength to POSITIVE_INFINITY when the store has POSITIVE_INFINITY value', () => {
    mockedUseResultsViewSettingsStore.mockReturnValue({
      ...mockStore,
      maxTextLength: Number.POSITIVE_INFINITY,
    });

    renderWithProviders(<SettingsPanel />);

    const slider = screen.getByRole('slider', {
      name: /max text length/i,
    });
    expect(slider).toBeInTheDocument();
    // Radix Slider uses aria-valuenow, not value property
    expect(slider).toHaveAttribute('aria-valuenow', '1001');
  });

  it('should have slider for max text length', () => {
    renderWithProviders(<SettingsPanel />);

    const slider = screen.getByRole('slider', {
      name: /max text length/i,
    });
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveAttribute('aria-valuenow', '500');
  });

  it('should disable Pass reasons when Pass/fail indicators is off', () => {
    mockedUseResultsViewSettingsStore.mockReturnValue({
      ...mockStore,
      showPassFail: false,
    });

    renderWithProviders(<SettingsPanel />);

    const passReasonsToggle = screen.getByRole('checkbox', { name: 'Pass reasons' });
    expect(passReasonsToggle).toBeDisabled();
  });

  it('should enable Pass reasons when Pass/fail indicators is on', () => {
    renderWithProviders(<SettingsPanel />);

    const passReasonsToggle = screen.getByRole('checkbox', { name: 'Pass reasons' });
    expect(passReasonsToggle).not.toBeDisabled();
  });
});
