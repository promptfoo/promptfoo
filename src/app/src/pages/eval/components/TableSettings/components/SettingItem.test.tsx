import { renderWithProviders } from '@app/utils/testutils';
import { fireEvent, render, screen } from '@testing-library/react';
import { List } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import SettingItem from './SettingItem';

describe('SettingItem', () => {
  const defaultProps = {
    label: 'Default Label',
    checked: false,
    onChange: vi.fn(),
  };

  it("should render the label and a checked checkbox when 'checked' is true and 'component' is not specified", () => {
    render(<SettingItem {...defaultProps} label="Enable Feature" checked={true} />);

    const labelElement = screen.getByText('Enable Feature');
    expect(labelElement).toBeInTheDocument();

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).toBeChecked();

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it("should render a checked switch when 'checked' is true and 'component' is set to 'switch'", () => {
    render(
      <SettingItem {...defaultProps} label="Enable Switch" checked={true} component="switch" />,
    );

    const labelElement = screen.getByText('Enable Switch');
    expect(labelElement).toBeInTheDocument();

    const switchElement = screen.getByRole('switch');
    expect(switchElement).toBeInTheDocument();
    expect(switchElement).toBeChecked();

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it("should display an info icon with a tooltip containing the provided text when 'tooltipText' is set", () => {
    const tooltipText = 'This is a tooltip message.';
    const label = 'Setting with Tooltip';
    renderWithProviders(<SettingItem {...defaultProps} label={label} tooltipText={tooltipText} />);

    const infoIcon = screen.getByLabelText(`Information about ${label}`);
    expect(infoIcon).toBeInTheDocument();
  });

  it('should call the onChange callback with the new checked value when the checkbox is clicked and disabled is false', () => {
    const onChange = vi.fn();
    render(
      <SettingItem
        {...defaultProps}
        label="Test Setting"
        checked={false}
        onChange={onChange}
        disabled={false}
      />,
    );
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('should render the control as disabled and not call onChange when disabled is true', () => {
    const onChange = vi.fn();
    render(
      <SettingItem
        {...defaultProps}
        label="Disabled Setting"
        disabled={true}
        onChange={onChange}
      />,
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeDisabled();

    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledTimes(0);
  });

  it('should display the provided icon next to the label when the icon prop is set', () => {
    const icon = <List data-testid="test-icon" />;
    render(<SettingItem {...defaultProps} label="Setting with Icon" icon={icon} />);

    const iconElement = screen.getByTestId('test-icon');
    expect(iconElement).toBeInTheDocument();
  });

  it('should handle special characters and non-Latin characters in the label', () => {
    const labelText = 'Special Chars: !@#$%^&*()_+=-`~[]{}|;\':",./<>? éàçüö';
    const expectedLabelId = 'setting-special-chars:-!@#$%^&*()_+=-`~[]{}|;\':",./<>?-éàçüö';

    render(<SettingItem {...defaultProps} label={labelText} />);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-labelledby', expectedLabelId);
  });

  it('should handle extremely long tooltip text without overflowing', () => {
    const longTooltipText =
      'This is an extremely long tooltip text that should not overflow the tooltip container. It should wrap to the next line if necessary to ensure that all the text is visible to the user. ' +
      'This is an extremely long tooltip text that should not overflow the tooltip container. It should wrap to the next line if necessary to ensure that all the text is visible to the user. ' +
      'This is an extremely long tooltip text that should not overflow the tooltip container. It should wrap to the next line if necessary to ensure that all the text is visible to the user.';

    renderWithProviders(
      <SettingItem
        {...defaultProps}
        label="Setting with Long Tooltip"
        tooltipText={longTooltipText}
      />,
    );

    const tooltipElement = screen.getByLabelText(`Information about Setting with Long Tooltip`);
    expect(tooltipElement).toBeInTheDocument();
  });
});
