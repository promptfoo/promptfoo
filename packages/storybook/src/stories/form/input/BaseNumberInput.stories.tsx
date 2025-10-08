import { BaseNumberInput } from 'promptfoo-toolkit';
import { fn } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, useEffect } from 'react';
import type { ComponentProps } from 'react';

// Wrapper component that manages value state internally
const BaseNumberInputWrapper = (props: ComponentProps<typeof BaseNumberInput>) => {
  const { value: propValue, onChange, ...otherProps } = props;
  const [value, setValue] = useState<number | undefined>(propValue);

  // Update internal value when prop value changes
  useEffect(() => {
    setValue(propValue);
  }, [propValue]);

  const handleChange = (newValue: number | undefined) => {
    setValue(newValue);
    onChange?.(newValue);
  };

  return (
    <BaseNumberInput
      {...otherProps}
      value={value}
      onChange={handleChange}
    />
  );
};

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = {
  title: 'Form/Input/BaseNumberInput',
  component: BaseNumberInputWrapper,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'centered',
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
  // More on argTypes: https://storybook.js.org/docs/api/argtypes
  argTypes: {
    label: {
      control: 'text',
      description: 'Input label',
    },
    value: {
      control: 'number',
      description: 'Input value',
    },
    defaultValue: {
      control: 'number',
      description: 'Default input value',
    },
    min: {
      control: 'number',
      description: 'Minimum allowable value for the input',
    },
    max: {
      control: 'number',
      description: 'Maximum allowable value for the input',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the input is disabled',
    },
    required: {
      control: 'boolean',
      description: 'Whether the input is required',
    },
    placeholder: {
      control: 'text',
      description: 'Input placeholder',
    },
    error: {
      control: 'boolean',
      description: 'Whether the input has an error state',
    },
    helperText: {
      control: 'text',
      description: 'Helper text displayed below the input',
    },
    size: {
      control: 'select',
      options: ['small', 'medium'],
      description: 'Size of the input',
    },
    variant: {
      control: 'select',
      options: ['outlined', 'filled', 'standard'],
      description: 'The variant to use',
    },
    fullWidth: {
      control: 'boolean',
      description: 'Whether the input should take up the full width',
    },
    multiline: {
      control: 'boolean',
      description: 'Whether the input is multiline',
    },
    rows: {
      control: 'number',
      description: 'Number of rows for multiline input',
    },
    maxRows: {
      control: 'number',
      description: 'Maximum number of rows for multiline input',
    },
    autoFocus: {
      control: 'boolean',
      description: 'Whether the input should be focused on mount',
    },
    margin: {
      control: 'select',
      options: ['none', 'dense', 'normal'],
      description: 'Margin of the input',
    },
    onChange: {
      action: 'changed',
      description:
        'onChange wrangles the base input event and exposes a callback that passes the numeric value of the field',
    },
  },
  // Use `fn` to spy on the onChange arg, which will appear in the actions panel once invoked
  args: { onChange: fn() },
} satisfies Meta<typeof BaseNumberInputWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const Default: Story = {
  args: {
    label: 'Amount',
    placeholder: 'Enter amount',
  },
};

export const WithValue: Story = {
  args: {
    label: 'Temperature',
    value: 25,
    placeholder: 'Enter temperature',
  },
};

export const WithMinMax: Story = {
  args: {
    label: 'Age',
    min: 0,
    max: 120,
    placeholder: 'Enter your age',
  },
};

export const Required: Story = {
  args: {
    label: 'Quantity',
    required: true,
    placeholder: 'Enter quantity',
  },
};

export const Disabled: Story = {
  args: {
    label: 'Read Only Number',
    value: 42,
    disabled: true,
  },
};

export const WithError: Story = {
  args: {
    label: 'Score',
    error: true,
    helperText: 'Score must be between 0 and 100',
    placeholder: 'Enter score',
  },
};

export const WithHelperText: Story = {
  args: {
    label: 'Count',
    helperText: 'Enter a positive number',
    placeholder: 'Enter count',
  },
};

export const NonNegativeOnly: Story = {
  args: {
    label: 'Non-negative Number',
    min: 0,
    placeholder: 'Enter a positive number',
  },
};

export const FullWidth: Story = {
  args: {
    label: 'Full Width Input',
    fullWidth: true,
    placeholder: 'This input takes full width',
  },
};

export const SmallVariant: Story = {
  args: {
    label: 'Small Size',
    size: 'small',
    variant: 'outlined',
    placeholder: 'Small input',
  },
};
