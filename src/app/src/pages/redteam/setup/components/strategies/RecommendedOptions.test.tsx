import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecommendedOptions } from './RecommendedOptions';
import { PRESET_IDS, STRATEGY_PRESETS } from './types';

describe('RecommendedOptions', () => {
  const mockOnMultiTurnChange = vi.fn();
  const mockOnStatefulChange = vi.fn();

  const defaultProps = {
    isMultiTurnEnabled: false,
    isStatefulValue: false,
    onMultiTurnChange: mockOnMultiTurnChange,
    onStatefulChange: mockOnStatefulChange,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the title and multiTurn checkbox when the medium preset has multiTurn options', () => {
    render(<RecommendedOptions {...defaultProps} />);

    expect(screen.getByRole('heading', { name: 'Recommended Options' })).toBeInTheDocument();

    const expectedLabel = STRATEGY_PRESETS[PRESET_IDS.MEDIUM].options!.multiTurn!.label;
    const checkbox = screen.getByLabelText(expectedLabel);
    expect(checkbox).toBeInTheDocument();

    expect(checkbox).not.toBeChecked();
  });

  it('should return null when STRATEGY_PRESETS[PRESET_IDS.MEDIUM].options.multiTurn is undefined', () => {
    const originalPreset = STRATEGY_PRESETS[PRESET_IDS.MEDIUM].options!.multiTurn;
    STRATEGY_PRESETS[PRESET_IDS.MEDIUM].options!.multiTurn = undefined as any;

    const { container } = render(<RecommendedOptions {...defaultProps} />);

    expect(container.firstChild).toBeNull();

    STRATEGY_PRESETS[PRESET_IDS.MEDIUM].options!.multiTurn = originalPreset;
  });

  it('should call onStatefulChange with the correct boolean value when a radio button is selected in the stateful options', () => {
    render(<RecommendedOptions {...defaultProps} isMultiTurnEnabled={true} />);

    const yesRadioButton = screen.getByLabelText(
      'Yes - my system is stateful and maintains conversation history',
    );

    fireEvent.click(yesRadioButton);

    expect(mockOnStatefulChange).toHaveBeenCalledWith(true);
  });

  it('should call onStatefulChange with false when "No" radio button is selected, even if initial value is true', () => {
    render(
      <RecommendedOptions
        {...{
          ...defaultProps,
          isMultiTurnEnabled: true,
          isStatefulValue: true,
        }}
      />,
    );

    const noRadioButton = screen.getByLabelText(
      'No - my system is not stateful, the full conversation history must be sent on every request',
    );

    fireEvent.click(noRadioButton);

    expect(mockOnStatefulChange).toHaveBeenCalledWith(false);
  });
});
