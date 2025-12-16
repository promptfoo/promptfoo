import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import EnhancedRangeSlider from './EnhancedRangeSlider';
import { tokens } from '../tokens';

const theme = createTheme();

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('EnhancedRangeSlider', () => {
  const defaultProps = {
    value: 50,
    onChange: vi.fn(),
    min: 0,
    max: 100,
    label: 'Test Slider',
  };

  describe('Rendering', () => {
    it('should render the slider and input field with the provided value, label, and unit when given valid props', () => {
      const testProps = {
        ...defaultProps,
        value: 75,
        label: 'Maximum Image Width',
        unit: 'px',
      };

      renderWithTheme(<EnhancedRangeSlider {...testProps} />);

      expect(screen.getByText('Maximum Image Width')).toBeInTheDocument();

      expect(screen.getByText('75px')).toBeInTheDocument();

      const slider = screen.getByRole('slider');
      expect(slider).toBeInTheDocument();
      expect(slider).toHaveAttribute('aria-valuenow', '75');

      expect(screen.getByText('0px')).toBeInTheDocument();
      expect(screen.getByText('100px')).toBeInTheDocument();
    });

    it('should render the slider and input field as disabled when the disabled prop is true', () => {
      const testProps = {
        ...defaultProps,
        disabled: true,
      };

      renderWithTheme(<EnhancedRangeSlider {...testProps} />);

      const slider = screen.getByRole('slider');
      expect(slider).toBeDisabled();

      const containerBox = screen.getByRole('group');
      expect(containerBox).toHaveStyle(`opacity: ${tokens.opacity.disabled}`);
    });

    it('should display the numeric value when value equals max but unlimited prop is false', () => {
      const testProps = {
        ...defaultProps,
        value: 100,
        max: 100,
        unlimited: false,
      };

      renderWithTheme(<EnhancedRangeSlider {...testProps} />);

      const valueDisplay = screen.getByRole('textbox', { name: 'Enter test slider value' });
      expect(valueDisplay).toHaveTextContent('100');
    });

    it('should render with the min value when NaN is passed as the value', () => {
      const testProps = {
        ...defaultProps,
        value: NaN,
        min: 25,
        max: 100,
        label: 'Test Slider',
      };

      renderWithTheme(<EnhancedRangeSlider {...testProps} />);

      expect(screen.getByRole('textbox', { name: 'Enter test slider value' }).textContent).toBe(
        '25',
      );

      const slider = screen.getByRole('slider');
      expect(slider).toHaveAttribute('aria-valuenow', '25');
    });

    it('should display unit in the input field when editing and unit prop is provided', () => {
      const testProps = {
        ...defaultProps,
        unit: 'px',
      };
      renderWithTheme(<EnhancedRangeSlider {...testProps} />);

      const textBox = screen.getByRole('textbox', { name: /Enter Test Slider value/i });
      fireEvent.click(textBox);

      screen.getByRole('textbox', { name: /Enter Test Slider value/i }).querySelector('input');

      expect(screen.getByText('px')).toBeInTheDocument();
    });
  });

  describe('Input Clamping', () => {
    it('should clamp the input value between min and max and call onChange with the clamped value when the input field is blurred after entering a valid number', () => {
      const onChange = vi.fn();
      const props = {
        ...defaultProps,
        min: 10,
        max: 90,
        value: 50,
        onChange: onChange,
      };

      renderWithTheme(<EnhancedRangeSlider {...props} />);

      const textBox = screen.getByRole('textbox', { name: /Enter test slider value/i });
      fireEvent.click(textBox);

      const input = screen
        .getByRole('textbox', { name: /Enter test slider value/i })
        .querySelector('input');
      if (!input) {
        throw new Error('Input not found');
      }

      fireEvent.change(input, { target: { value: '95' } });
      fireEvent.blur(input);

      expect(onChange).toHaveBeenCalledWith(90);
      expect(textBox.querySelector('p')).toHaveTextContent('90');
    });
  });

  describe('Keyboard Interaction', () => {
    it('should commit the input value and exit editing mode when Enter is pressed in the input field', () => {
      const onChange = vi.fn();
      const props = { ...defaultProps, onChange };
      renderWithTheme(<EnhancedRangeSlider {...props} />);

      const valueBox = screen.getByRole('textbox', { name: /Enter Test Slider value/i });
      fireEvent.click(valueBox);

      const input = screen
        .getByRole('textbox', { name: /Enter Test Slider value/i })
        .querySelector('input');
      expect(input).toBeInTheDocument();

      fireEvent.change(input!, { target: { value: '75' } });

      fireEvent.keyDown(input!, { key: 'Enter' });

      expect(onChange).toHaveBeenCalledWith(75);

      expect(screen.getByText('75')).toBeInTheDocument();
    });
  });

  describe('Unlimited Mode', () => {
    it('should display "Unlimited" when unlimited is true and value equals max', () => {
      const testProps = {
        ...defaultProps,
        value: 100,
        max: 100,
        unlimited: true,
        label: 'Maximum Text Length',
      };

      renderWithTheme(<EnhancedRangeSlider {...testProps} />);

      expect(
        screen.getByRole('textbox', { name: 'Enter maximum text length value' }).textContent,
      ).toBe('Unlimited');

      const slider = screen.getByRole('slider');
      expect(slider).toHaveAttribute('aria-valuetext', 'Unlimited');
    });
  });

  describe('Callbacks', () => {
    it('should call onChangeCommitted with the final value when the slider is released, if the callback is provided', () => {
      const onChangeCommitted = vi.fn();
      const testProps = {
        ...defaultProps,
        onChangeCommitted,
      };

      renderWithTheme(<EnhancedRangeSlider {...testProps} />);

      const slider = screen.getByRole('slider') as HTMLInputElement;
      fireEvent.change(slider, { target: { value: 60 } });
      fireEvent.mouseUp(slider);

      expect(onChangeCommitted).toHaveBeenCalledWith(60);
    });
  });

  describe('Input Validation', () => {
    it('should not call onChangeCommitted with invalid values when input field is blurred after entering non-numeric text', () => {
      const onChangeCommittedMock = vi.fn();
      const testProps = {
        ...defaultProps,
        onChangeCommitted: onChangeCommittedMock,
      };

      renderWithTheme(<EnhancedRangeSlider {...testProps} />);

      const textBox = screen.getByRole('textbox', { name: /enter test slider value/i });
      fireEvent.click(textBox);
      const inputElement = screen
        .getByRole('textbox', { name: /enter test slider value/i })
        .querySelector('input') as HTMLInputElement;
      fireEvent.change(inputElement, { target: { value: 'abc' } });
      fireEvent.blur(inputElement);

      expect(onChangeCommittedMock).not.toHaveBeenCalled();
    });
  });

  describe('Input Handling', () => {
    it('should reset input value when Escape key is pressed during editing', () => {
      const testProps = {
        ...defaultProps,
        value: 75,
        label: 'Maximum Image Width',
        unit: 'px',
      };

      renderWithTheme(<EnhancedRangeSlider {...testProps} />);

      const textBox = screen.getByRole('textbox', { name: 'Enter maximum image width value' });
      fireEvent.click(textBox);

      const input = screen
        .getByRole('textbox', { name: 'Enter maximum image width value' })
        .querySelector('input');
      expect(input).toBeInTheDocument();

      fireEvent.change(input!, { target: { value: '80' } });
      expect(input).toHaveValue('80');

      fireEvent.keyDown(input!, { key: 'Escape' });

      expect(screen.getByText('75px')).toBeInTheDocument();
    });
  });

  describe('Input', () => {
    it('should handle "Unlimited" input value correctly when unlimited prop is true', () => {
      const onChange = vi.fn();
      const props = {
        ...defaultProps,
        unlimited: true,
        onChange: onChange,
      };

      renderWithTheme(<EnhancedRangeSlider {...props} />);

      const textBox = screen.getByRole('textbox', { name: /Enter test slider value/i });
      fireEvent.click(textBox);

      const input = screen
        .getByRole('textbox', { name: /Enter test slider value/i })
        .querySelector('input');
      if (!input) {
        throw new Error('Input not found');
      }

      fireEvent.change(input, { target: { value: 'Unlimited' } });
      fireEvent.blur(input);

      expect(onChange).toHaveBeenCalledWith(100);
    });
  });

  describe('Functionality', () => {
    it('should trigger onChange when debounced value changes', async () => {
      const onChange = vi.fn();
      const props = { ...defaultProps, onChange };
      renderWithTheme(<EnhancedRangeSlider {...props} />);

      const slider = screen.getByRole('slider') as HTMLInputElement;
      fireEvent.change(slider, { target: { value: 60 } });

      // Wait for the debounced onChange to be called (150ms debounce + React cycles)
      await waitFor(
        () => {
          expect(onChange).toHaveBeenCalledTimes(1);
          expect(onChange).toHaveBeenCalledWith(60);
        },
        { timeout: 500 },
      );
    });
  });
});
