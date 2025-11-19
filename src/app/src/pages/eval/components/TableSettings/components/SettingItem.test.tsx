import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import SettingItem from './SettingItem';
import ViewListIcon from '@mui/icons-material/ViewList';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { alpha } from '@mui/material';
import userEvent from '@testing-library/user-event';

vi.mock('@mui/material/Tooltip', async () => {
  const ActualTooltip =
    await vi.importActual<typeof import('@mui/material/Tooltip')>('@mui/material/Tooltip');
  const MockTooltip = ({ children, componentsProps, ...props }: any) => {
    return (
      <ActualTooltip.default {...props} componentsProps={componentsProps}>
        {children}
      </ActualTooltip.default>
    );
  };
  return {
    default: MockTooltip,
  };
});

const theme = createTheme();
const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('SettingItem', () => {
  const defaultProps = {
    label: 'Default Label',
    checked: false,
    onChange: vi.fn(),
  };

  it("should render the label and a checked checkbox when 'checked' is true and 'component' is not specified", () => {
    renderWithTheme(<SettingItem {...defaultProps} label="Enable Feature" checked={true} />);

    const labelElement = screen.getByText('Enable Feature');
    expect(labelElement).toBeInTheDocument();

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).toBeChecked();

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it("should render a checked switch when 'checked' is true and 'component' is set to 'switch'", () => {
    renderWithTheme(
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
    renderWithTheme(<SettingItem {...defaultProps} label={label} tooltipText={tooltipText} />);

    const infoIcon = screen.getByLabelText(`Information about ${label}`);
    expect(infoIcon).toBeInTheDocument();
  });

  it('should call the onChange callback with the new checked value when the checkbox is clicked and disabled is false', () => {
    const onChange = vi.fn();
    renderWithTheme(
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
    renderWithTheme(
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
    const icon = <ViewListIcon data-testid="test-icon" />;
    renderWithTheme(<SettingItem {...defaultProps} label="Setting with Icon" icon={icon} />);

    const iconElement = screen.getByTestId('test-icon');
    expect(iconElement).toBeInTheDocument();
  });

  it('should handle special characters and non-Latin characters in the label', () => {
    const labelText = 'Special Chars: !@#$%^&*()_+=-`~[]\{}|;\':",./<>? éàçüö';
    const expectedLabelId = 'setting-special-chars:-!@#$%^&*()_+=-`~[]{}|;\':",./<>?-éàçüö';

    renderWithTheme(<SettingItem {...defaultProps} label={labelText} />);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-labelledby', expectedLabelId);
  });

  it('should handle extremely long tooltip text without overflowing', () => {
    const longTooltipText =
      'This is an extremely long tooltip text that should not overflow the tooltip container. It should wrap to the next line if necessary to ensure that all the text is visible to the user. ' +
      'This is an extremely long tooltip text that should not overflow the tooltip container. It should wrap to the next line if necessary to ensure that all the text is visible to the user. ' +
      'This is an extremely long tooltip text that should not overflow the tooltip container. It should wrap to the next line if necessary to ensure that all the text is visible to the user.';

    renderWithTheme(
      <SettingItem
        {...defaultProps}
        label="Setting with Long Tooltip"
        tooltipText={longTooltipText}
      />,
    );

    const tooltipElement = screen.getByLabelText(`Information about Setting with Long Tooltip`);
    expect(tooltipElement).toBeInTheDocument();
  });

  it('should apply dark mode styling to the info icon when theme mode is dark', () => {
    const darkTheme = createTheme({
      palette: { mode: 'dark', primary: { main: '#90caf9', light: '#e3f2fd' } },
    });
    render(
      <ThemeProvider theme={darkTheme}>
        <SettingItem
          {...defaultProps}
          label="Test Setting"
          tooltipText="Test tooltip"
          icon={<InfoOutlinedIcon />}
        />
      </ThemeProvider>,
    );

    const infoButton = screen.getByLabelText('Information about Test Setting');
    expect(infoButton).toHaveStyle(`color: ${alpha(darkTheme.palette.primary.light, 0.7)}`);
  });

  it('should apply dark mode styling to tooltip when theme mode is dark', async () => {
    const darkTheme = createTheme({
      palette: {
        mode: 'dark',
        primary: { main: '#1976d2', dark: '#0d47a1' },
      },
    });

    render(
      <ThemeProvider theme={darkTheme}>
        <SettingItem {...defaultProps} label="Dark Mode Setting" tooltipText="This is a tooltip" />
      </ThemeProvider>,
    );

    const infoButton = screen.getByLabelText(/information about/i);
    await userEvent.hover(infoButton);

    const tooltip = await screen.findByRole('tooltip');
    const computedStyle = window.getComputedStyle(tooltip);

    expect(computedStyle.backgroundColor).toContain('rgba');
  });
});
