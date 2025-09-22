import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Config } from '../types';
import { RunOptions, RunOptionsContent } from './RunOptions';
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

      const debugSwitch = screen.getByRole('checkbox', { name: /Debug mode/i });
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
      const debugSwitch = screen.getByRole('checkbox', { name: /Debug mode/i });
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

describe('RunOptions', () => {
  const mockUpdateConfig = vi.fn();
  const mockUpdateRunOption = vi.fn();

  const defaultProps = {
    numTests: 50,
    runOptions: {
      delay: 100,
      maxConcurrency: 1,
      verbose: true,
    },
    updateConfig: mockUpdateConfig as (section: keyof Config, value: any) => void,
    updateRunOption: mockUpdateRunOption as (key: keyof RedteamRunOptions, value: any) => void,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render an Accordion containing RunOptionsContent with the provided props when expanded', () => {
    render(<RunOptions {...defaultProps} />);

    const accordionHeader = screen.getByRole('button', { name: 'Run Options' });
    expect(accordionHeader).toBeInTheDocument();

    const numTestsInput = screen.getByLabelText('Number of test cases');
    expect(numTestsInput).toBeInTheDocument();

    expect(numTestsInput).toHaveValue(defaultProps.numTests);

    const delayInput = screen.getByLabelText('Delay between API calls (ms)');
    expect(delayInput).toHaveValue(defaultProps.runOptions.delay);

    const debugSwitch = screen.getByRole('checkbox', { name: /Debug mode/i });
    expect(debugSwitch).toBeChecked();
  });

  it('should have the Accordion expanded by default on initial render', () => {
    render(<RunOptions {...defaultProps} />);

    const numTestsInput = screen.getByLabelText('Number of test cases');
    expect(numTestsInput).toBeInTheDocument();
  });

  it('should handle undefined/null props without errors and use default values', () => {
    render(
      <RunOptions
        numTests={undefined}
        runOptions={undefined}
        updateConfig={mockUpdateConfig as (section: keyof Config, value: any) => void}
        updateRunOption={mockUpdateRunOption as (key: keyof RedteamRunOptions, value: any) => void}
      />,
    );

    const numTestsInput = screen.getByLabelText('Number of test cases');
    expect(numTestsInput).toHaveValue(0);

    const delayInput = screen.getByLabelText('Delay between API calls (ms)');
    expect(delayInput).toHaveValue(0);

    const maxConcurrencyInput = screen.getByLabelText('Max number of concurrent requests');
    expect(maxConcurrencyInput).toHaveValue(5);
  });

  it('should set the correct ARIA attributes on the AccordionSummary for accessibility', () => {
    render(<RunOptions {...defaultProps} />);

    const accordionSummary = screen.getByRole('button', { name: 'Run Options' });

    if (accordionSummary) {
      expect(accordionSummary).toHaveAttribute('aria-controls', 'run-options-content');
      expect(accordionSummary).toHaveAttribute('id', 'run-options-header');
    }
  });
});
