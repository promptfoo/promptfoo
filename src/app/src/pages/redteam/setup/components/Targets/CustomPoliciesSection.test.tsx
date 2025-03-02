import { vi, describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CustomPoliciesSection, PolicyInput } from './CustomPoliciesSection';
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';

vi.mock('../../hooks/useRedTeamConfig');

describe('CustomPoliciesSection', () => {
  const mockUpdateConfig = vi.fn();

  beforeEach(() => {
    vi.mocked(useRedTeamConfig).mockReturnValue({
      config: {
        plugins: []
      },
      updateConfig: mockUpdateConfig,
      isLoading: false
    });
  });

  it('renders with default policy', () => {
    render(<CustomPoliciesSection />);
    expect(screen.getByText(/Custom policies define rules that the AI should follow/)).toBeInTheDocument();
    expect(screen.getByText('Add Policy')).toBeInTheDocument();
    expect(screen.getByLabelText('Policy Name')).toHaveValue('Custom Policy 1');
  });

  it('adds new policy when clicking add button', async () => {
    render(<CustomPoliciesSection />);

    const addButton = screen.getByText('Add Policy');
    fireEvent.click(addButton);

    expect(screen.getAllByLabelText('Policy Name')).toHaveLength(2);
    expect(screen.getAllByLabelText('Policy Name')[1]).toHaveValue('Custom Policy 2');
  });

  it('deletes policy when clicking delete button', () => {
    render(<CustomPoliciesSection />);

    const deleteButton = screen.getByTestId('DeleteIcon').parentElement;
    fireEvent.click(deleteButton!);

    expect(screen.queryByLabelText('Policy Name')).not.toBeInTheDocument();
  });

  it('updates policy name', () => {
    render(<CustomPoliciesSection />);

    const nameInput = screen.getByLabelText('Policy Name');
    fireEvent.change(nameInput, { target: { value: 'New Policy Name' } });

    expect(nameInput).toHaveValue('New Policy Name');
  });

  it('toggles policy expansion', () => {
    render(<CustomPoliciesSection />);

    const expandButton = screen.getByTestId('ExpandLessIcon').parentElement;
    fireEvent.click(expandButton!);

    expect(screen.getByTestId('ExpandMoreIcon')).toBeInTheDocument();
  });

  it('updates config when policy changes', async () => {
    vi.useFakeTimers();
    render(<CustomPoliciesSection />);

    const policyInput = screen.getByLabelText('Policy Text');

    await act(async () => {
      fireEvent.change(policyInput, { target: { value: 'New policy text' } });
      vi.advanceTimersByTime(500);
    });

    expect(mockUpdateConfig).toHaveBeenCalledWith('plugins', [
      {
        id: 'policy',
        config: {
          policy: 'New policy text'
        }
      }
    ]);

    vi.useRealTimers();
  });
});

describe('PolicyInput', () => {
  it('renders policy input field', () => {
    const mockOnChange = vi.fn();
    render(<PolicyInput id="test-id" value="Test policy" onChange={mockOnChange} />);

    const input = screen.getByLabelText('Policy Text');
    expect(input).toHaveValue('Test policy');
  });

  it('calls onChange when input changes', () => {
    const mockOnChange = vi.fn();
    render(<PolicyInput id="test-id" value="" onChange={mockOnChange} />);

    const input = screen.getByLabelText('Policy Text');
    fireEvent.change(input, { target: { value: 'New policy' } });

    expect(mockOnChange).toHaveBeenCalledWith('test-id', 'New policy');
  });

  it('debounces onChange calls', async () => {
    vi.useFakeTimers();
    const mockOnChange = vi.fn();

    render(<PolicyInput id="test-id" value="" onChange={mockOnChange} />);
    const input = screen.getByLabelText('Policy Text');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'New policy' } });
      vi.advanceTimersByTime(300);
    });

    expect(mockOnChange).toHaveBeenCalledWith('test-id', 'New policy');
    vi.useRealTimers();
  });
});
