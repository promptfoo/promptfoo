import { TooltipProvider } from '@app/components/ui/tooltip';
import { REDTEAM_DEFAULTS } from '@promptfoo/redteam/constants';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Config } from '../types';
import {
  DelayBetweenAPICallsInput,
  MaxNumberOfConcurrentRequestsInput,
  NumberOfTestCasesInput,
  RUNOPTIONS_TEXT,
  RunOptionsContent,
} from './RunOptions';
import type { RedteamRunOptions } from '@promptfoo/types';

const renderWithTooltipProvider = (component: React.ReactNode) => {
  return render(<TooltipProvider>{component}</TooltipProvider>);
};

describe('RUNOPTIONS_TEXT', () => {
  it('should have all the required properties and nested structure for each input type', () => {
    expect(RUNOPTIONS_TEXT).toBeDefined();

    expect(RUNOPTIONS_TEXT.numberOfTests).toBeDefined();
    expect(RUNOPTIONS_TEXT.numberOfTests.helper).toBeDefined();
    expect(RUNOPTIONS_TEXT.numberOfTests.error).toBeDefined();

    expect(RUNOPTIONS_TEXT.delayBetweenApiCalls).toBeDefined();
    expect(RUNOPTIONS_TEXT.delayBetweenApiCalls.helper).toBeDefined();
    expect(RUNOPTIONS_TEXT.delayBetweenApiCalls.error).toBeDefined();

    expect(RUNOPTIONS_TEXT.maxConcurrentRequests).toBeDefined();
    expect(RUNOPTIONS_TEXT.maxConcurrentRequests.helper).toBeDefined();
    expect(RUNOPTIONS_TEXT.maxConcurrentRequests.error).toBeDefined();
  });
});

describe('RunOptionsContent', () => {
  const mockUpdateConfig = vi.fn();
  const mockUpdateRunOption = vi.fn();

  const defaultProps = {
    numTests: 10,
    runOptions: {
      delay: 0,
      maxConcurrency: 1,
      verbose: false,
    },
    updateConfig: mockUpdateConfig as (section: keyof Config, value: any) => void,
    updateRunOption: mockUpdateRunOption as (key: keyof RedteamRunOptions, value: any) => void,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render all run option fields when provided with valid props', () => {
      renderWithTooltipProvider(<RunOptionsContent {...defaultProps} />);

      const numTestsInput = screen.getByLabelText('Number of test cases');
      expect(numTestsInput).toBeInTheDocument();
      expect(numTestsInput).toHaveValue(defaultProps.numTests);

      const delayInput = screen.getByLabelText('Delay between API calls');
      expect(delayInput).toBeInTheDocument();
      expect(delayInput).toHaveValue(defaultProps.runOptions.delay);
      expect(delayInput).not.toBeDisabled();

      const maxConcurrencyInput = screen.getByLabelText('Max concurrent requests');
      expect(maxConcurrencyInput).toBeInTheDocument();
      expect(maxConcurrencyInput).toHaveValue(defaultProps.runOptions.maxConcurrency);
      expect(maxConcurrencyInput).not.toBeDisabled();

      const debugSwitch = screen.getByRole('switch', { name: /Debug mode/i });
      expect(debugSwitch).toBeInTheDocument();
      expect(debugSwitch).not.toBeChecked();
    });

    it('should disable the delay field and show a tooltip when maxConcurrency is greater than 1', () => {
      const props = {
        ...defaultProps,
        runOptions: {
          ...defaultProps.runOptions,
          maxConcurrency: 2,
        },
      };
      const { container } = renderWithTooltipProvider(<RunOptionsContent {...props} />);

      const delayInput = screen.getByLabelText('Delay between API calls');

      expect(delayInput).toBeDisabled();

      // Check for the wrapper div with title attribute for native tooltip
      const wrapperWithTooltip = container.querySelector(
        'div[title="Set concurrent requests to 1 to enable delay"]',
      );
      expect(wrapperWithTooltip).toBeInTheDocument();
    });

    it('should disable maxConcurrency and show tooltip when delay is greater than 0', () => {
      const props = {
        ...defaultProps,
        runOptions: {
          ...defaultProps.runOptions,
          delay: 100,
        },
      };
      const { container } = renderWithTooltipProvider(<RunOptionsContent {...props} />);

      const maxConcurrencyInput = screen.getByLabelText('Max concurrent requests');

      expect(maxConcurrencyInput).toBeDisabled();

      // Check for the wrapper div with title attribute for native tooltip
      const wrapperWithTooltip = container.querySelector(
        'div[title="Set delay to 0 to enable concurrency"]',
      );
      expect(wrapperWithTooltip).toBeInTheDocument();
    });

    describe('Rendering with large values', () => {
      it('should render with clamped minimum values when provided with Number.MAX_SAFE_INTEGER', () => {
        const largeValue = Number.MAX_SAFE_INTEGER;
        const props = {
          ...defaultProps,
          numTests: largeValue,
          runOptions: {
            delay: largeValue,
            maxConcurrency: largeValue,
            verbose: false,
          },
        };

        renderWithTooltipProvider(<RunOptionsContent {...props} />);

        const numTestsInput = screen.getByLabelText('Number of test cases') as HTMLInputElement;
        expect(numTestsInput).toBeInTheDocument();
        expect(Number(numTestsInput.value)).toBe(largeValue);

        const delayInput = screen.getByLabelText('Delay between API calls') as HTMLInputElement;
        expect(delayInput).toBeInTheDocument();
        expect(Number(delayInput.value)).toBe(largeValue);

        const maxConcurrencyInput = screen.getByLabelText(
          'Max concurrent requests',
        ) as HTMLInputElement;
        expect(maxConcurrencyInput).toBeInTheDocument();
        expect(Number(maxConcurrencyInput.value)).toBe(largeValue);
      });
    });
  });

  describe('Functionality', () => {
    it('should call updateConfig with the correct arguments when the number of test cases field is changed to a valid number', () => {
      renderWithTooltipProvider(<RunOptionsContent {...defaultProps} />);
      const numTestsInput = screen.getByLabelText('Number of test cases');

      fireEvent.change(numTestsInput, { target: { value: '25' } });
      fireEvent.blur(numTestsInput);

      expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
      expect(mockUpdateConfig).toHaveBeenCalledWith('numTests', 25);
    });

    it('should initialize with default numTests when numTests prop is undefined and update config on blur', () => {
      renderWithTooltipProvider(<RunOptionsContent {...defaultProps} numTests={undefined} />);
      const numTestsInput = screen.getByLabelText('Number of test cases');
      fireEvent.blur(numTestsInput);
      expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
      expect(mockUpdateConfig).toHaveBeenCalledWith('numTests', REDTEAM_DEFAULTS.NUM_TESTS);
    });
  });

  describe('Interactions', () => {
    it('should call updateRunOption("verbose", checked) when the debug mode switch is toggled', () => {
      renderWithTooltipProvider(<RunOptionsContent {...defaultProps} />);
      const debugSwitch = screen.getByRole('switch', { name: /Debug mode/i });
      fireEvent.click(debugSwitch);
      expect(mockUpdateRunOption).toHaveBeenCalledWith('verbose', true);
    });

    it("should call updateRunOption('delay', value) and updateRunOption('maxConcurrency', 1) when the delay field is changed to a valid value and maxConcurrency is 1", () => {
      renderWithTooltipProvider(<RunOptionsContent {...defaultProps} />);

      const delayInput = screen.getByLabelText('Delay between API calls');
      fireEvent.change(delayInput, { target: { value: '500' } });
      fireEvent.blur(delayInput);

      expect(mockUpdateRunOption).toHaveBeenCalledWith('delay', 500);
      expect(mockUpdateRunOption).toHaveBeenCalledWith('maxConcurrency', 1);
    });

    it("should call updateRunOption('maxConcurrency', value) and updateRunOption('delay', 0) when the maxConcurrency field is changed to a valid value and delay is 0", () => {
      renderWithTooltipProvider(<RunOptionsContent {...defaultProps} />);

      const maxConcurrencyInput = screen.getByLabelText('Max concurrent requests');
      fireEvent.change(maxConcurrencyInput, { target: { value: '5' } });
      fireEvent.blur(maxConcurrencyInput);

      expect(mockUpdateRunOption).toHaveBeenCalledTimes(2);
      expect(mockUpdateRunOption).toHaveBeenCalledWith('maxConcurrency', 5);
      expect(mockUpdateRunOption).toHaveBeenCalledWith('delay', 0);
    });
  });

  describe('Input Validation', () => {
    it('should reset maxConcurrency to 1 when invalid input is entered', () => {
      renderWithTooltipProvider(<RunOptionsContent {...defaultProps} />);
      const maxConcurrencyInput = screen.getByLabelText('Max concurrent requests');

      fireEvent.change(maxConcurrencyInput, { target: { value: '-1' } });
      fireEvent.blur(maxConcurrencyInput);
      expect(mockUpdateRunOption).toHaveBeenCalledWith('maxConcurrency', 1);

      mockUpdateRunOption.mockClear();

      fireEvent.change(maxConcurrencyInput, { target: { value: 'abc' } });
      fireEvent.blur(maxConcurrencyInput);
      expect(mockUpdateRunOption).toHaveBeenCalledWith('maxConcurrency', 1);
    });
  });
});

describe('DelayBetweenAPICallsInput', () => {
  const setValue = vi.fn();
  const setMaxConcurrencyValue = vi.fn();
  const updateRunOption = vi.fn();

  const baseProps = {
    value: '0',
    setValue,
    updateRunOption,
    readOnly: false,
    canSetDelay: true,
    setMaxConcurrencyValue,
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls setValue on change with the stringified number', () => {
    renderWithTooltipProvider(<DelayBetweenAPICallsInput {...baseProps} />);
    const input = screen.getByLabelText('Delay between API calls');
    fireEvent.change(input, { target: { value: '250' } });
    expect(setValue).toHaveBeenCalledWith('250');
  });

  it('persists value on blur and enforces maxConcurrency=1 with setMaxConcurrencyValue("1")', () => {
    renderWithTooltipProvider(<DelayBetweenAPICallsInput {...baseProps} value="250" />);
    const input = screen.getByLabelText('Delay between API calls');
    fireEvent.blur(input);
    expect(updateRunOption).toHaveBeenCalledWith('delay', 250);
    expect(setValue).toHaveBeenCalledWith('250');
    expect(updateRunOption).toHaveBeenCalledWith('maxConcurrency', 1);
    expect(setMaxConcurrencyValue).toHaveBeenCalledWith('1');
  });

  it('clamps negative values to 0 on blur and enforces maxConcurrency=1', () => {
    renderWithTooltipProvider(<DelayBetweenAPICallsInput {...baseProps} value="-5" />);
    const input = screen.getByLabelText('Delay between API calls');
    fireEvent.blur(input);
    expect(updateRunOption).toHaveBeenCalledWith('delay', 0);
    expect(setValue).toHaveBeenCalledWith('0');
    expect(updateRunOption).toHaveBeenCalledWith('maxConcurrency', 1);
    expect(setMaxConcurrencyValue).toHaveBeenCalledWith('1');
  });

  it('shows error state when a value below 0 is entered', () => {
    renderWithTooltipProvider(<DelayBetweenAPICallsInput {...baseProps} value="-1" />);
    const input = screen.getByLabelText('Delay between API calls');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(RUNOPTIONS_TEXT.delayBetweenApiCalls.error)).toBeInTheDocument();
  });

  it('does not show error state and shows default helper when value is valid (>= 0)', () => {
    renderWithTooltipProvider(<DelayBetweenAPICallsInput {...baseProps} value="10" />);
    const input = screen.getByLabelText('Delay between API calls');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByText(RUNOPTIONS_TEXT.delayBetweenApiCalls.helper)).toBeInTheDocument();
  });

  it('when readOnly, blurring the field does not trigger updateRunOption or setMaxConcurrencyValue calls', () => {
    renderWithTooltipProvider(<DelayBetweenAPICallsInput {...baseProps} readOnly={true} />);
    const input = screen.getByLabelText('Delay between API calls');
    fireEvent.blur(input);
    expect(updateRunOption).not.toHaveBeenCalled();
    expect(setMaxConcurrencyValue).not.toHaveBeenCalled();
  });

  it('is disabled when readOnly=true even if canSetDelay=true', () => {
    renderWithTooltipProvider(
      <DelayBetweenAPICallsInput {...baseProps} readOnly={true} canSetDelay={true} />,
    );
    const input = screen.getByLabelText('Delay between API calls');
    expect(input).toBeDisabled();
  });

  it('displays a wrapper with tooltip title when canSetDelay is false', () => {
    const { container } = renderWithTooltipProvider(
      <DelayBetweenAPICallsInput {...baseProps} canSetDelay={false} />,
    );
    // Check for the wrapper div with title attribute for native tooltip
    const wrapperWithTooltip = container.querySelector(
      'div[title="Set concurrent requests to 1 to enable delay"]',
    );
    expect(wrapperWithTooltip).toBeInTheDocument();
  });

  it('handles whitespace-only input by treating it as 0 on blur', () => {
    renderWithTooltipProvider(<DelayBetweenAPICallsInput {...baseProps} value="   " />);
    const input = screen.getByLabelText('Delay between API calls');
    fireEvent.blur(input);
    expect(updateRunOption).toHaveBeenCalledWith('delay', 0);
    expect(setValue).toHaveBeenCalledWith('0');
    expect(updateRunOption).toHaveBeenCalledWith('maxConcurrency', 1);
    expect(setMaxConcurrencyValue).toHaveBeenCalledWith('1');
  });

  it('handles Number.MAX_SAFE_INTEGER by clamping or handling appropriately on blur', () => {
    const maxSafeIntegerString = Number.MAX_SAFE_INTEGER.toString();
    renderWithTooltipProvider(
      <DelayBetweenAPICallsInput {...baseProps} value={maxSafeIntegerString} />,
    );
    const input = screen.getByLabelText('Delay between API calls');
    fireEvent.blur(input);

    expect(updateRunOption).toHaveBeenCalled();
    const updateRunOptionValue = (updateRunOption.mock.calls[0] as any)[1];
    expect(typeof updateRunOptionValue).toBe('number');

    expect(setValue).toHaveBeenCalledWith(String(updateRunOptionValue));
    expect(updateRunOption).toHaveBeenCalledWith('maxConcurrency', 1);
    expect(setMaxConcurrencyValue).toHaveBeenCalledWith('1');
  });
});

describe('MaxNumberOfConcurrentRequestsInput', () => {
  const setValue = vi.fn();
  const setDelayValue = vi.fn();
  const updateRunOption = vi.fn();

  const baseProps = {
    value: '1',
    setValue,
    setDelayValue,
    updateRunOption,
    readOnly: false,
    canSetMaxConcurrency: true,
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls setValue on change with the stringified number and does not call setDelayValue', () => {
    renderWithTooltipProvider(<MaxNumberOfConcurrentRequestsInput {...baseProps} />);
    const input = screen.getByLabelText('Max concurrent requests');

    fireEvent.change(input, { target: { value: '7' } });

    expect(setValue).toHaveBeenCalledWith('7');
    expect(setDelayValue).not.toHaveBeenCalled();
  });

  it('persists value on blur and enforces delay=0 with setDelayValue("0")', () => {
    renderWithTooltipProvider(<MaxNumberOfConcurrentRequestsInput {...baseProps} value="5" />);
    const input = screen.getByLabelText('Max concurrent requests');

    fireEvent.blur(input);

    expect(updateRunOption).toHaveBeenCalledWith('maxConcurrency', 5);
    expect(setValue).toHaveBeenCalledWith('5');
    expect(updateRunOption).toHaveBeenCalledWith('delay', 0);
    expect(setDelayValue).toHaveBeenCalledWith('0');
  });

  it('clamps values below 1 to 1 on blur and enforces delay=0', () => {
    renderWithTooltipProvider(<MaxNumberOfConcurrentRequestsInput {...baseProps} value="0" />);
    const input = screen.getByLabelText('Max concurrent requests');

    fireEvent.blur(input);

    expect(updateRunOption).toHaveBeenCalledWith('maxConcurrency', 1);
    expect(setValue).toHaveBeenCalledWith('1');
    expect(updateRunOption).toHaveBeenCalledWith('delay', 0);
    expect(setDelayValue).toHaveBeenCalledWith('0');
  });

  it('shows error state when a value below 1 is entered', () => {
    renderWithTooltipProvider(<MaxNumberOfConcurrentRequestsInput {...baseProps} value="0" />);
    const input = screen.getByLabelText('Max concurrent requests');

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(RUNOPTIONS_TEXT.maxConcurrentRequests.error)).toBeInTheDocument();
  });

  it('does not show error state and shows default helper when value is valid (>= 1)', () => {
    renderWithTooltipProvider(<MaxNumberOfConcurrentRequestsInput {...baseProps} value="3" />);
    const input = screen.getByLabelText('Max concurrent requests');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByText(RUNOPTIONS_TEXT.maxConcurrentRequests.helper)).toBeInTheDocument();
  });

  it('does not call onChange or onBlur handlers when readOnly is true', () => {
    renderWithTooltipProvider(
      <MaxNumberOfConcurrentRequestsInput {...baseProps} readOnly={true} />,
    );
    const input = screen.getByLabelText('Max concurrent requests');

    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.blur(input);

    expect(setValue).not.toHaveBeenCalled();
    expect(updateRunOption).not.toHaveBeenCalled();
    expect(setDelayValue).not.toHaveBeenCalled();
  });

  it('defaults to 1 on blur when the input is an empty string and enforces delay=0', () => {
    renderWithTooltipProvider(<MaxNumberOfConcurrentRequestsInput {...baseProps} value="" />);
    const input = screen.getByLabelText('Max concurrent requests');

    fireEvent.blur(input);

    expect(updateRunOption).toHaveBeenCalledWith('maxConcurrency', 1);
    expect(setValue).toHaveBeenCalledWith('1');
    expect(updateRunOption).toHaveBeenCalledWith('delay', 0);
    expect(setDelayValue).toHaveBeenCalledWith('0');
  });

  it('should default to 1, update state, and enforce delay=0 when receiving a non-numeric string onBlur', () => {
    renderWithTooltipProvider(<MaxNumberOfConcurrentRequestsInput {...baseProps} value="abc" />);
    const input = screen.getByLabelText('Max concurrent requests');

    fireEvent.blur(input);

    expect(updateRunOption).toHaveBeenCalledWith('maxConcurrency', 1);
    expect(setValue).toHaveBeenCalledWith('1');
    expect(updateRunOption).toHaveBeenCalledWith('delay', 0);
    expect(setDelayValue).toHaveBeenCalledWith('0');
  });

  it('should handle form submission with an invalid value by clamping to the minimum value', () => {
    renderWithTooltipProvider(<MaxNumberOfConcurrentRequestsInput {...baseProps} />);
    const input = screen.getByLabelText('Max concurrent requests');

    fireEvent.change(input, { target: { value: '0' } });

    fireEvent.blur(input);

    expect(updateRunOption).toHaveBeenCalledWith('maxConcurrency', 1);
    expect(setValue).toHaveBeenCalledWith('1');
    expect(updateRunOption).toHaveBeenCalledWith('delay', 0);
    expect(setDelayValue).toHaveBeenCalledWith('0');
  });
});

describe('NumberOfTestCasesInput', () => {
  const setValue = vi.fn();
  const updateConfig = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should allow typing a new number and persist it on blur', () => {
    renderWithTooltipProvider(
      <NumberOfTestCasesInput value="23" setValue={setValue} updateConfig={updateConfig} />,
    );

    const numTestsInput = screen.getByLabelText('Number of test cases');

    // Trigger blur event directly
    fireEvent.blur(numTestsInput);

    expect(updateConfig).toHaveBeenCalledWith('numTests', 23);
  });

  it('should fallback to default when cleared then blurred', () => {
    renderWithTooltipProvider(
      <NumberOfTestCasesInput value="" setValue={setValue} updateConfig={updateConfig} />,
    );

    const numTestsInput = screen.getByLabelText('Number of test cases');

    // Clear previous calls from the initial render
    updateConfig.mockClear();

    // Trigger blur event directly
    fireEvent.blur(numTestsInput);

    expect(updateConfig).toHaveBeenCalledWith('numTests', REDTEAM_DEFAULTS.NUM_TESTS);
  });

  it('should use custom default when cleared then blurred', () => {
    const customDefault = 50;
    renderWithTooltipProvider(
      <NumberOfTestCasesInput
        value=""
        setValue={setValue}
        updateConfig={updateConfig}
        defaultNumberOfTests={customDefault}
      />,
    );

    const numTestsInput = screen.getByLabelText('Number of test cases');

    updateConfig.mockClear();

    fireEvent.blur(numTestsInput);

    expect(updateConfig).toHaveBeenCalledWith('numTests', customDefault);
  });

  it('should fallback to default when a non-numeric string is entered and blurred', () => {
    renderWithTooltipProvider(
      <NumberOfTestCasesInput value="abc" setValue={setValue} updateConfig={updateConfig} />,
    );

    const numTestsInput = screen.getByLabelText('Number of test cases');

    fireEvent.blur(numTestsInput);

    expect(updateConfig).toHaveBeenCalledWith('numTests', REDTEAM_DEFAULTS.NUM_TESTS);
  });

  it('should not call updateConfig when readOnly is true and the input is blurred', () => {
    renderWithTooltipProvider(
      <NumberOfTestCasesInput
        value="23"
        setValue={setValue}
        updateConfig={updateConfig}
        readOnly={true}
      />,
    );

    const numTestsInput = screen.getByLabelText('Number of test cases');
    fireEvent.change(numTestsInput, { target: { value: '25' } });
    fireEvent.blur(numTestsInput);

    expect(updateConfig).not.toHaveBeenCalled();
  });

  it('should clamp negative number to default value on blur', () => {
    renderWithTooltipProvider(
      <NumberOfTestCasesInput value="-5" setValue={setValue} updateConfig={updateConfig} />,
    );

    const numTestsInput = screen.getByLabelText('Number of test cases');

    fireEvent.blur(numTestsInput);

    expect(updateConfig).toHaveBeenCalledWith('numTests', REDTEAM_DEFAULTS.NUM_TESTS);
    expect(setValue).toHaveBeenCalledWith(String(REDTEAM_DEFAULTS.NUM_TESTS));
  });

  it('displays error state and message when value is less than 1', () => {
    renderWithTooltipProvider(
      <NumberOfTestCasesInput value="0" setValue={setValue} updateConfig={updateConfig} />,
    );

    const numTestsInput = screen.getByLabelText('Number of test cases');

    expect(numTestsInput).toHaveAttribute('aria-invalid', 'true');

    expect(screen.getByText(RUNOPTIONS_TEXT.numberOfTests.error)).toBeInTheDocument();
  });

  it('does not show error state and shows default helper when value is valid (>= 1)', () => {
    renderWithTooltipProvider(
      <NumberOfTestCasesInput value="3" setValue={setValue} updateConfig={updateConfig} />,
    );

    const numTestsInput = screen.getByLabelText('Number of test cases');

    expect(numTestsInput).toHaveAttribute('aria-invalid', 'false');

    expect(screen.getByText(RUNOPTIONS_TEXT.numberOfTests.helper)).toBeInTheDocument();
  });

  it('should not display helper text when RUNOPTIONS_TEXT.missingProperty is accessed', () => {
    const originalRunOptionsText = { ...RUNOPTIONS_TEXT };
    // @ts-ignore - Intentionally testing access to a non-existent property
    RUNOPTIONS_TEXT.missingProperty = { helper: undefined, error: undefined };

    renderWithTooltipProvider(
      <NumberOfTestCasesInput value="3" setValue={setValue} updateConfig={updateConfig} />,
    );

    expect(screen.queryByText('undefined')).toBeNull();

    // @ts-ignore - Restoring the original object
    RUNOPTIONS_TEXT.missingProperty = originalRunOptionsText.missingProperty;
  });
});
