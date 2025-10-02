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
      render(<RunOptionsContent {...defaultProps} />);

      const numTestsInput = screen.getByLabelText('Number of test cases');
      expect(numTestsInput).toBeInTheDocument();
      expect(numTestsInput).toHaveValue(defaultProps.numTests);

      const delayInput = screen.getByLabelText('Delay between API calls (ms)');
      expect(delayInput).toBeInTheDocument();
      expect(delayInput).toHaveValue(defaultProps.runOptions.delay);
      expect(delayInput).not.toBeDisabled();

      const maxConcurrencyInput = screen.getByLabelText('Max number of concurrent requests');
      expect(maxConcurrencyInput).toBeInTheDocument();
      expect(maxConcurrencyInput).toHaveValue(defaultProps.runOptions.maxConcurrency);
      expect(maxConcurrencyInput).not.toBeDisabled();

      const debugSwitch = screen.getByRole('switch', { name: /Debug mode/i });
      expect(debugSwitch).toBeInTheDocument();
      expect(debugSwitch).not.toBeChecked();
    });

    it('should disable the delay field and show a tooltip label when maxConcurrency is greater than 1', () => {
      const props = {
        ...defaultProps,
        runOptions: {
          ...defaultProps.runOptions,
          maxConcurrency: 2,
        },
      };
      render(<RunOptionsContent {...props} />);

      const delayInput = screen.getByLabelText('Delay between API calls (ms)');

      expect(delayInput).toBeDisabled();

      const tooltips = screen.getAllByLabelText(
        'To set a delay, you must set the number of concurrent requests to 1.',
      );
      expect(tooltips.length).toBeGreaterThan(0);
    });

    it('should disable maxConcurrency and show tooltip when delay is greater than 0', () => {
      const props = {
        ...defaultProps,
        runOptions: {
          ...defaultProps.runOptions,
          delay: 100,
        },
      };
      render(<RunOptionsContent {...props} />);

      const maxConcurrencyInput = screen.getByLabelText('Max number of concurrent requests');

      expect(maxConcurrencyInput).toBeDisabled();

      const tooltips = screen.getAllByLabelText(
        'To set a max concurrency, you must set the delay to 0.',
      );
      expect(tooltips.length).toBeGreaterThan(0);
    });
  });

  describe('Functionality', () => {
    it('should call updateConfig with the correct arguments when the number of test cases field is changed to a valid number', () => {
      render(<RunOptionsContent {...defaultProps} />);
      const numTestsInput = screen.getByLabelText('Number of test cases');

      fireEvent.change(numTestsInput, { target: { value: '25' } });
      fireEvent.blur(numTestsInput);

      expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
      expect(mockUpdateConfig).toHaveBeenCalledWith('numTests', 25);
    });
  });

  describe('Interactions', () => {
    it('should call updateRunOption("verbose", checked) when the debug mode switch is toggled', () => {
      render(<RunOptionsContent {...defaultProps} />);
      const debugSwitch = screen.getByRole('switch', { name: /Debug mode/i });
      fireEvent.click(debugSwitch);
      expect(mockUpdateRunOption).toHaveBeenCalledWith('verbose', true);
    });

    it("should call updateRunOption('delay', value) and updateRunOption('maxConcurrency', 1) when the delay field is changed to a valid value and maxConcurrency is 1", () => {
      render(<RunOptionsContent {...defaultProps} />);

      const delayInput = screen.getByLabelText('Delay between API calls (ms)');
      fireEvent.change(delayInput, { target: { value: '500' } });
      fireEvent.blur(delayInput);

      expect(mockUpdateRunOption).toHaveBeenCalledWith('delay', 500);
      expect(mockUpdateRunOption).toHaveBeenCalledWith('maxConcurrency', 1);
    });

    it("should call updateRunOption('maxConcurrency', value) and updateRunOption('delay', 0) when the maxConcurrency field is changed to a valid value and delay is 0", () => {
      render(<RunOptionsContent {...defaultProps} />);

      const maxConcurrencyInput = screen.getByLabelText('Max number of concurrent requests');
      fireEvent.change(maxConcurrencyInput, { target: { value: '5' } });
      fireEvent.blur(maxConcurrencyInput);

      expect(mockUpdateRunOption).toHaveBeenCalledTimes(2);
      expect(mockUpdateRunOption).toHaveBeenCalledWith('maxConcurrency', 5);
      expect(mockUpdateRunOption).toHaveBeenCalledWith('delay', 0);
    });
  });

  describe('Input Validation', () => {
    it('should reset maxConcurrency to 1 when invalid input is entered', () => {
      render(<RunOptionsContent {...defaultProps} />);
      const maxConcurrencyInput = screen.getByLabelText('Max number of concurrent requests');

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
    render(<DelayBetweenAPICallsInput {...baseProps} />);
    const input = screen.getByLabelText('Delay between API calls (ms)');
    fireEvent.change(input, { target: { value: '250' } });
    expect(setValue).toHaveBeenCalledWith('250');
  });

  it('persists value on blur and enforces maxConcurrency=1 with setMaxConcurrencyValue("1")', () => {
    render(<DelayBetweenAPICallsInput {...baseProps} value="250" />);
    const input = screen.getByLabelText('Delay between API calls (ms)');
    fireEvent.blur(input);
    expect(updateRunOption).toHaveBeenCalledWith('delay', 250);
    expect(setValue).toHaveBeenCalledWith('250');
    expect(updateRunOption).toHaveBeenCalledWith('maxConcurrency', 1);
    expect(setMaxConcurrencyValue).toHaveBeenCalledWith('1');
  });

  it('clamps negative values to 0 on blur and enforces maxConcurrency=1', () => {
    render(<DelayBetweenAPICallsInput {...baseProps} value="-5" />);
    const input = screen.getByLabelText('Delay between API calls (ms)');
    fireEvent.blur(input);
    expect(updateRunOption).toHaveBeenCalledWith('delay', 0);
    expect(setValue).toHaveBeenCalledWith('0');
    expect(updateRunOption).toHaveBeenCalledWith('maxConcurrency', 1);
    expect(setMaxConcurrencyValue).toHaveBeenCalledWith('1');
  });

  it('shows error state when a value below 0 is entered', () => {
    render(<DelayBetweenAPICallsInput {...baseProps} value="-1" />);
    const input = screen.getByLabelText('Delay between API calls (ms)');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(RUNOPTIONS_TEXT.delayBetweenApiCalls.error)).toBeInTheDocument();
  });

  it('does not show error state and shows default helper when value is valid (>= 0)', () => {
    render(<DelayBetweenAPICallsInput {...baseProps} value="10" />);
    const input = screen.getByLabelText('Delay between API calls (ms)');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText(RUNOPTIONS_TEXT.delayBetweenApiCalls.helper)).toBeInTheDocument();
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
    render(<MaxNumberOfConcurrentRequestsInput {...baseProps} />);
    const input = screen.getByLabelText('Max number of concurrent requests');

    fireEvent.change(input, { target: { value: '7' } });

    expect(setValue).toHaveBeenCalledWith('7');
    expect(setDelayValue).not.toHaveBeenCalled();
  });

  it('persists value on blur and enforces delay=0 with setDelayValue("0")', () => {
    render(<MaxNumberOfConcurrentRequestsInput {...baseProps} value="5" />);
    const input = screen.getByLabelText('Max number of concurrent requests');

    fireEvent.blur(input);

    expect(updateRunOption).toHaveBeenCalledWith('maxConcurrency', 5);
    expect(setValue).toHaveBeenCalledWith('5');
    expect(updateRunOption).toHaveBeenCalledWith('delay', 0);
    expect(setDelayValue).toHaveBeenCalledWith('0');
  });

  it('clamps values below 1 to 1 on blur and enforces delay=0', () => {
    render(<MaxNumberOfConcurrentRequestsInput {...baseProps} value="0" />);
    const input = screen.getByLabelText('Max number of concurrent requests');

    fireEvent.blur(input);

    expect(updateRunOption).toHaveBeenCalledWith('maxConcurrency', 1);
    expect(setValue).toHaveBeenCalledWith('1');
    expect(updateRunOption).toHaveBeenCalledWith('delay', 0);
    expect(setDelayValue).toHaveBeenCalledWith('0');
  });

  it('shows error state when a value below 1 is entered', () => {
    render(<MaxNumberOfConcurrentRequestsInput {...baseProps} value="0" />);
    const input = screen.getByLabelText('Max number of concurrent requests');

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(RUNOPTIONS_TEXT.maxConcurrentRequests.error)).toBeInTheDocument();
  });

  it('does not show error state and shows default helper when value is valid (>= 1)', () => {
    render(<MaxNumberOfConcurrentRequestsInput {...baseProps} value="3" />);
    const input = screen.getByLabelText('Max number of concurrent requests');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText(RUNOPTIONS_TEXT.maxConcurrentRequests.helper)).toBeInTheDocument();
  });
});

describe('NumberOfTestCasesInput', () => {
  const setValue = vi.fn();
  const updateConfig = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should allow typing a new number and persist it on blur', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    render(<NumberOfTestCasesInput value="10" setValue={setValue} updateConfig={updateConfig} />);

    const numTestsInput = screen.getByLabelText('Number of test cases');

    await user.click(numTestsInput);
    await user.type(numTestsInput, '{backspace}{backspace}');
    await user.type(numTestsInput, '23');

    (numTestsInput as HTMLInputElement).blur();

    expect(updateConfig).toHaveBeenCalledWith('numTests', 23);
  });

  it('should fallback to default when cleared then blurred', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    render(<NumberOfTestCasesInput value="10" setValue={setValue} updateConfig={updateConfig} />);

    const numTestsInput = screen.getByLabelText('Number of test cases');

    await user.click(numTestsInput);
    await user.type(numTestsInput, '{backspace}{backspace}');

    expect(numTestsInput).toHaveValue(null);

    (numTestsInput as HTMLInputElement).blur();

    expect(updateConfig).toHaveBeenCalledWith('numTests', REDTEAM_DEFAULTS.NUM_TESTS);
  });

  it('displays error state and message when value is less than 1', () => {
    render(<NumberOfTestCasesInput value="0" setValue={setValue} updateConfig={updateConfig} />);

    const numTestsInput = screen.getByLabelText('Number of test cases');

    expect(numTestsInput).toHaveAttribute('aria-invalid', 'true');

    expect(screen.getByText(RUNOPTIONS_TEXT.numberOfTests.error)).toBeInTheDocument();
  });

  it('does not show error state and shows default helper when value is valid (>= 1)', () => {
    render(<NumberOfTestCasesInput value="3" setValue={setValue} updateConfig={updateConfig} />);

    const numTestsInput = screen.getByLabelText('Number of test cases');

    expect(numTestsInput).not.toHaveAttribute('aria-invalid');

    expect(screen.getByText(RUNOPTIONS_TEXT.numberOfTests.helper)).toBeInTheDocument();
  });
});
