import type { ComponentProps } from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailVerificationDialog } from './EmailVerificationDialog';

const mockSaveEmail = vi.fn();
const mockClearEmail = vi.fn();
const mockCheckEmailStatus = vi.fn();
const mockShowToast = vi.fn();

vi.mock('@app/hooks/useEmailVerification', () => ({
  useEmailVerification: () => ({
    saveEmail: mockSaveEmail,
    clearEmail: mockClearEmail,
    checkEmailStatus: mockCheckEmailStatus,
  }),
}));

vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({
    showToast: mockShowToast,
  }),
}));

describe('EmailVerificationDialog', () => {
  const mockProps: ComponentProps<typeof EmailVerificationDialog> = {
    open: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  };

  const renderComponent = (props: ComponentProps<typeof EmailVerificationDialog> = mockProps) => {
    return render(<EmailVerificationDialog {...props} />);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Note: Do NOT use vi.useFakeTimers() here - it breaks userEvent interactions
    mockSaveEmail.mockResolvedValue({ error: null });
    mockCheckEmailStatus.mockResolvedValue({ canProceed: true, error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly when open', () => {
    renderComponent();

    expect(screen.getByText('Email Required')).toBeInTheDocument();
    expect(screen.getByLabelText('Work Email Address')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /verify email/i })).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    renderComponent({ ...mockProps, open: false });
    expect(screen.queryByText('Email Required')).not.toBeInTheDocument();
  });

  it('displays custom message when provided', () => {
    const customMessage = 'Custom verification message';
    renderComponent({
      open: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      message: customMessage,
    });

    expect(screen.getByText(customMessage)).toBeInTheDocument();
  });

  it('calls onClose when Cancel button is clicked', async () => {
    renderComponent();

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mockProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('disables submit button when email is empty', () => {
    renderComponent();

    const submitButton = screen.getByRole('button', { name: /verify email/i });
    expect(submitButton).toBeDisabled();
  });

  it('enables submit button when email is entered', async () => {
    renderComponent();

    const emailInput = screen.getByLabelText('Work Email Address');
    await userEvent.type(emailInput, 'test@example.com');

    const submitButton = screen.getByRole('button', { name: /verify email/i });
    expect(submitButton).toBeEnabled();
  });

  it('shows validation error for invalid email', async () => {
    renderComponent();

    const emailInput = screen.getByLabelText('Work Email Address');
    await userEvent.type(emailInput, 'invalid-email');

    const submitButton = screen.getByRole('button', { name: /verify email/i });
    await userEvent.click(submitButton);

    expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
    expect(mockSaveEmail).not.toHaveBeenCalled();
  });

  it('submits valid email and calls onSuccess', async () => {
    renderComponent();

    const emailInput = screen.getByLabelText('Work Email Address');
    await userEvent.type(emailInput, 'test@example.com');

    const submitButton = screen.getByRole('button', { name: /verify email/i });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(mockSaveEmail).toHaveBeenCalledWith('test@example.com');
      expect(mockCheckEmailStatus).toHaveBeenCalledWith({ validate: true });
      expect(mockShowToast).toHaveBeenCalledWith('Email saved successfully, starting redteam.');
      expect(mockProps.onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it('displays error when saveEmail fails', async () => {
    mockSaveEmail.mockResolvedValue({ error: 'Invalid email domain' });

    renderComponent();

    const emailInput = screen.getByLabelText('Work Email Address');
    await userEvent.type(emailInput, 'test@example.com');

    await userEvent.click(screen.getByRole('button', { name: /verify email/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid email domain')).toBeInTheDocument();
      expect(mockClearEmail).toHaveBeenCalled();
      expect(mockProps.onSuccess).not.toHaveBeenCalled();
    });
  });

  it('displays error when checkEmailStatus fails', async () => {
    mockCheckEmailStatus.mockResolvedValue({ error: 'Validation failed', canProceed: false });

    renderComponent();

    const emailInput = screen.getByLabelText('Work Email Address');
    await userEvent.type(emailInput, 'test@example.com');

    await userEvent.click(screen.getByRole('button', { name: /verify email/i }));

    await waitFor(() => {
      expect(screen.getByText('Validation failed')).toBeInTheDocument();
      expect(mockClearEmail).toHaveBeenCalled();
      expect(mockProps.onSuccess).not.toHaveBeenCalled();
    });
  });

  it('handles Enter key submission', async () => {
    renderComponent();

    const emailInput = screen.getByLabelText('Work Email Address');
    await userEvent.type(emailInput, 'test@example.com');

    fireEvent.keyDown(emailInput, { key: 'Enter' });

    await waitFor(() => {
      expect(mockSaveEmail).toHaveBeenCalledWith('test@example.com');
    });
  });

  it('disables form during submission', async () => {
    let resolveSaveEmail: (value: { error: null }) => void;
    mockSaveEmail.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSaveEmail = resolve;
        }),
    );

    renderComponent();

    const emailInput = screen.getByLabelText('Work Email Address');
    await userEvent.type(emailInput, 'test@example.com');

    await userEvent.click(screen.getByRole('button', { name: /verify email/i }));

    // Wait for the button to change to "Verifying..." state
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /verifying/i })).toBeDisabled();
    });
    expect(emailInput).toBeDisabled();

    // Resolve the save email promise
    await act(async () => {
      resolveSaveEmail!({ error: null });
    });

    await waitFor(() => {
      expect(mockProps.onSuccess).toHaveBeenCalled();
    });
  });
});
