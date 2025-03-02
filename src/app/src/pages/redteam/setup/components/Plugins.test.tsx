import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useRedTeamConfig, useRecentlyUsedPlugins } from '../hooks/useRedTeamConfig';
import Plugins from './Plugins';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { HARM_PLUGINS, riskCategories } from '@promptfoo/redteam/constants';

vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: vi.fn()
}));

vi.mock('../hooks/useRedTeamConfig', () => ({
  useRedTeamConfig: vi.fn(),
  useRecentlyUsedPlugins: vi.fn()
}));

describe('Plugins', () => {
  const mockOnNext = vi.fn();
  const mockOnBack = vi.fn();
  const mockRecordEvent = vi.fn();
  const mockUpdatePlugins = vi.fn();
  const mockAddPlugin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    (useTelemetry as any).mockReturnValue({
      recordEvent: mockRecordEvent
    });

    (useRedTeamConfig as any).mockReturnValue({
      config: {
        plugins: []
      },
      updatePlugins: mockUpdatePlugins
    });

    (useRecentlyUsedPlugins as any).mockReturnValue({
      plugins: [],
      addPlugin: mockAddPlugin
    });
  });

  it('renders without crashing', () => {
    render(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);
    expect(screen.getByText('Plugin Configuration')).toBeInTheDocument();
  });

  it('records page view telemetry on mount', () => {
    render(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);
    expect(mockRecordEvent).toHaveBeenCalledWith('webui_page_view', {
      page: 'redteam_config_plugins'
    });
  });

  it('handles plugin selection', async () => {
    const mockPlugins = ['harmful:misinfo'];
    (useRedTeamConfig as any).mockReturnValue({
      config: {
        plugins: []
      },
      updatePlugins: mockUpdatePlugins
    });

    render(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

    await act(async () => {
      const selectAllButton = screen.getAllByText('Select all')[0];
      fireEvent.click(selectAllButton);
      await vi.advanceTimersByTime(1000);
    });

    expect(mockAddPlugin).toHaveBeenCalled();
  });

  it('handles plugin search filtering', async () => {
    render(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

    await act(async () => {
      const searchInput = screen.getByLabelText('Filter Plugins');
      fireEvent.change(searchInput, { target: { value: 'misinfo' } });
      await vi.advanceTimersByTime(500);
    });

    expect(screen.getAllByText('Select all')).toHaveLength(1);
    expect(screen.getAllByText('Select none')).toHaveLength(1);
  });

  it('handles preset selection', () => {
    render(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

    const recommendedPreset = screen.getByText('Recommended');
    fireEvent.click(recommendedPreset);

    expect(mockRecordEvent).toHaveBeenCalledWith('feature_used', {
      feature: 'redteam_config_plugins_preset_selected',
      preset: 'Recommended'
    });
  });

  it('disables next button when no plugins selected', () => {
    render(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

    const nextButton = screen.getByText('Next');
    expect(nextButton).toBeDisabled();
  });

  it('enables next button when valid plugins are selected', () => {
    (useRedTeamConfig as any).mockReturnValue({
      config: {
        plugins: ['harmful:misinfo']
      },
      updatePlugins: mockUpdatePlugins
    });

    render(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

    const nextButton = screen.getByText('Next');
    expect(nextButton).not.toBeDisabled();
  });

  it('handles back button click', () => {
    render(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

    const backButton = screen.getByText('Back');
    fireEvent.click(backButton);

    expect(mockOnBack).toHaveBeenCalled();
  });

  it('updates plugins config when plugins are selected/deselected', async () => {
    render(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

    await act(async () => {
      const selectAllButton = screen.getAllByText('Select all')[0];
      fireEvent.click(selectAllButton);
      await vi.advanceTimersByTime(1000);
    });

    expect(mockUpdatePlugins).toHaveBeenCalled();
  });

  it('handles plugin configuration dialog', () => {
    const configPlugin = 'indirect-prompt-injection';
    (useRedTeamConfig as any).mockReturnValue({
      config: {
        plugins: []
      },
      updatePlugins: mockUpdatePlugins
    });

    render(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

    act(() => {
      const selectAllButton = screen.getAllByText('Select all')[0];
      fireEvent.click(selectAllButton);
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('handles select all/none actions', async () => {
    render(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

    await act(async () => {
      const selectAllButton = screen.getAllByText('Select all')[0];
      fireEvent.click(selectAllButton);
      await vi.advanceTimersByTime(1000);

      const selectNoneButton = screen.getAllByText('Select none')[0];
      fireEvent.click(selectNoneButton);
      await vi.advanceTimersByTime(1000);
    });

    expect(mockUpdatePlugins).toHaveBeenCalledTimes(2);
  });

  it('filters out policy and intent plugins', async () => {
    (useRedTeamConfig as any).mockReturnValue({
      config: {
        plugins: ['policy', 'intent', 'harmful:misinfo']
      },
      updatePlugins: mockUpdatePlugins
    });

    render(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

    const policyPlugins = screen.queryAllByText('policy');
    const intentPlugins = screen.queryAllByText('intent');

    expect(policyPlugins).toHaveLength(0);
    expect(intentPlugins).toHaveLength(0);
  });
});
