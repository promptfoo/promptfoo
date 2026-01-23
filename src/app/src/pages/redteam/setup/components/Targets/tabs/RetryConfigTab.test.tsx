import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RetryConfigTab from './RetryConfigTab';

import type { HttpProviderOptions } from '../../../types';

describe('RetryConfigTab', () => {
  let mockUpdateCustomTarget: (field: string, value: unknown) => void;

  beforeEach(() => {
    mockUpdateCustomTarget = vi.fn();
  });

  describe('Initial Rendering', () => {
    it('should render the max retries input', () => {
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {},
      };

      render(
        <RetryConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      expect(screen.getByLabelText('Max Retries')).toBeInTheDocument();
    });

    it('should render description text', () => {
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {},
      };

      render(
        <RetryConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      expect(screen.getByText(/Configure retry behavior for failed HTTP requests/i)).toBeInTheDocument();
    });

    it('should render link to documentation', () => {
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {},
      };

      render(
        <RetryConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      const link = screen.getByRole('link', { name: 'docs' });
      expect(link).toHaveAttribute('href', 'https://www.promptfoo.dev/docs/providers/http/#error-handling');
    });

    it('should display default value of 4 when maxRetries is not configured', () => {
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {},
      };

      render(
        <RetryConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      const input = screen.getByLabelText('Max Retries') as HTMLInputElement;
      expect(input.value).toBe('4');
    });

    it('should display configured maxRetries value', () => {
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {
          maxRetries: 2,
        },
      };

      render(
        <RetryConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      const input = screen.getByLabelText('Max Retries') as HTMLInputElement;
      expect(input.value).toBe('2');
    });

    it('should display 0 when maxRetries is set to 0', () => {
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {
          maxRetries: 0,
        },
      };

      render(
        <RetryConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      const input = screen.getByLabelText('Max Retries') as HTMLInputElement;
      expect(input.value).toBe('0');
    });
  });

  describe('User Interactions', () => {
    it('should call updateCustomTarget when value changes', () => {
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {},
      };

      render(
        <RetryConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      const input = screen.getByLabelText('Max Retries');
      fireEvent.change(input, { target: { value: '2' } });

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('maxRetries', 2);
    });

    it('should call updateCustomTarget with 0 to disable retries', () => {
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {
          maxRetries: 4,
        },
      };

      render(
        <RetryConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      const input = screen.getByLabelText('Max Retries');
      fireEvent.change(input, { target: { value: '0' } });

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('maxRetries', 0);
    });

    it('should call updateCustomTarget with undefined when input is cleared', () => {
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {
          maxRetries: 2,
        },
      };

      render(
        <RetryConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      const input = screen.getByLabelText('Max Retries');
      fireEvent.change(input, { target: { value: '' } });

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('maxRetries', undefined);
    });

    it('should not accept negative values', () => {
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {},
      };

      render(
        <RetryConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      const input = screen.getByLabelText('Max Retries');
      fireEvent.change(input, { target: { value: '-1' } });

      // The component should not call updateCustomTarget with negative values
      expect(mockUpdateCustomTarget).not.toHaveBeenCalledWith('maxRetries', -1);
    });
  });

  describe('Help Text', () => {
    it('should display help text explaining the retry behavior', () => {
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {},
      };

      render(
        <RetryConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      expect(screen.getByText(/Number of retry attempts after initial request fails/i)).toBeInTheDocument();
      expect(screen.getByText(/Set to 0 to disable retries/i)).toBeInTheDocument();
    });
  });
});
