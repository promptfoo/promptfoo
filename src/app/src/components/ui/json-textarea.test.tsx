import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { JsonTextarea } from './json-textarea';

describe('JsonTextarea', () => {
  it('renders with label', () => {
    render(<JsonTextarea label="JSON Config" />);
    expect(screen.getByText('JSON Config')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('accepts valid JSON input', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<JsonTextarea label="Config" onChange={handleChange} />);
    const textarea = screen.getByRole('textbox');

    await user.click(textarea);
    await user.paste('{"valid": true}');
    expect(handleChange).toHaveBeenCalledWith({ valid: true });
  });

  it('shows error for invalid JSON', async () => {
    const user = userEvent.setup();
    render(<JsonTextarea label="Config" />);
    const textarea = screen.getByRole('textbox');

    await user.click(textarea);
    await user.paste('{invalid json}');
    expect(screen.getByText('Invalid JSON')).toBeInTheDocument();
  });

  it('removes error when JSON becomes valid', async () => {
    const user = userEvent.setup();
    render(<JsonTextarea label="Config" />);
    const textarea = screen.getByRole('textbox');

    await user.click(textarea);
    await user.paste('{invalid}');
    expect(screen.getByText('Invalid JSON')).toBeInTheDocument();

    await user.clear(textarea);
    await user.paste('{"valid": true}');
    expect(screen.queryByText('Invalid JSON')).not.toBeInTheDocument();
  });

  it('shows error border for invalid JSON', async () => {
    const user = userEvent.setup();
    render(<JsonTextarea label="Config" />);
    const textarea = screen.getByRole('textbox');

    await user.click(textarea);
    await user.paste('{invalid}');
    expect(textarea).toHaveClass('border-destructive');
  });

  it('sets default value', () => {
    const defaultValue = '{"default": true}';
    render(<JsonTextarea label="Config" defaultValue={defaultValue} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe(defaultValue);
  });

  it('applies custom className', () => {
    const { container } = render(<JsonTextarea label="Config" className="custom-json" />);
    const wrapper = container.querySelector('.custom-json');
    expect(wrapper).toBeInTheDocument();
  });

  it('handles empty string as valid JSON edge case', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<JsonTextarea label="Config" onChange={handleChange} />);
    const textarea = screen.getByRole('textbox');

    await user.type(textarea, '""');
    expect(handleChange).toHaveBeenCalledWith('');
    expect(screen.queryByText('Invalid JSON')).not.toBeInTheDocument();
  });

  it('handles arrays as valid JSON', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<JsonTextarea label="Config" onChange={handleChange} />);
    const textarea = screen.getByRole('textbox');

    await user.click(textarea);
    await user.paste('[1, 2, 3]');
    expect(handleChange).toHaveBeenCalledWith([1, 2, 3]);
  });

  it('calls onChange only for valid JSON', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<JsonTextarea label="Config" onChange={handleChange} />);
    const textarea = screen.getByRole('textbox');

    await user.click(textarea);
    await user.paste('{invalid}');
    expect(handleChange).not.toHaveBeenCalled();

    await user.clear(textarea);
    await user.paste('{"valid": true}');
    expect(handleChange).toHaveBeenCalled();
  });
});
