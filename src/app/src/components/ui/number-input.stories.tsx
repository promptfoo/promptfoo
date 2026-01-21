import { useState } from 'react';

import { NumberInput } from './number-input';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof NumberInput> = {
  title: 'UI/NumberInput',
  component: NumberInput,
  tags: ['autodocs'],
  argTypes: {
    label: {
      control: 'text',
      description: 'Label text',
    },
    helperText: {
      control: 'text',
      description: 'Helper text below the input',
    },
    error: {
      control: 'text',
      description: 'Error message or boolean',
    },
    min: {
      control: 'number',
      description: 'Minimum value',
    },
    max: {
      control: 'number',
      description: 'Maximum value',
    },
    step: {
      control: 'number',
      description: 'Step increment',
    },
    allowDecimals: {
      control: 'boolean',
      description: 'Allow decimal values',
    },
    disabled: {
      control: 'boolean',
      description: 'Disable the input',
    },
    fullWidth: {
      control: 'boolean',
      description: 'Make input full width',
    },
  },
};

export default meta;
type Story = StoryObj<typeof NumberInput>;

// Default number input
export const Default: Story = {
  render: function DefaultNumberInput() {
    const [value, setValue] = useState<number | undefined>(50);
    return <NumberInput value={value} onChange={setValue} label="Count" className="w-[200px]" />;
  },
};

// With label and helper text
export const WithLabelAndHelper: Story = {
  render: function LabeledNumberInput() {
    const [value, setValue] = useState<number | undefined>(0.7);
    return (
      <NumberInput
        value={value}
        onChange={setValue}
        label="Temperature"
        helperText="Value between 0 and 2 for controlling randomness"
        min={0}
        max={2}
        step={0.1}
        allowDecimals
        className="w-[200px]"
      />
    );
  },
};

// With error
export const WithError: Story = {
  render: function ErrorNumberInput() {
    const [value, setValue] = useState<number | undefined>(150);
    return (
      <NumberInput
        value={value}
        onChange={setValue}
        label="Max Tokens"
        error="Value must be between 1 and 100"
        min={1}
        max={100}
        className="w-[200px]"
      />
    );
  },
};

// With end adornment
export const WithEndAdornment: Story = {
  render: function AdornmentNumberInput() {
    const [value, setValue] = useState<number | undefined>(1000);
    return (
      <NumberInput
        value={value}
        onChange={setValue}
        label="Timeout"
        endAdornment={<span className="text-sm text-muted-foreground">ms</span>}
        min={0}
        className="w-[200px]"
      />
    );
  },
};

// Different ranges
export const DifferentRanges: Story = {
  render: function RangesNumberInput() {
    const [count, setCount] = useState<number | undefined>(5);
    const [percentage, setPercentage] = useState<number | undefined>(75);
    const [temperature, setTemperature] = useState<number | undefined>(0.7);

    return (
      <div className="space-y-4 w-[250px]">
        <NumberInput
          value={count}
          onChange={setCount}
          label="Count (1-10)"
          min={1}
          max={10}
          step={1}
        />
        <NumberInput
          value={percentage}
          onChange={setPercentage}
          label="Percentage (0-100)"
          min={0}
          max={100}
          step={5}
          endAdornment={<span className="text-sm text-muted-foreground">%</span>}
        />
        <NumberInput
          value={temperature}
          onChange={setTemperature}
          label="Temperature (0-2)"
          min={0}
          max={2}
          step={0.1}
          allowDecimals
        />
      </div>
    );
  },
};

// Disabled state
export const Disabled: Story = {
  render: function DisabledNumberInput() {
    const [value, setValue] = useState<number | undefined>(42);
    return (
      <NumberInput
        value={value}
        onChange={setValue}
        label="Disabled Input"
        disabled
        className="w-[200px]"
      />
    );
  },
};

// Read only
export const ReadOnly: Story = {
  render: function ReadOnlyNumberInput() {
    const [value, setValue] = useState<number | undefined>(100);
    return (
      <NumberInput
        value={value}
        onChange={setValue}
        label="Read Only"
        readOnly
        className="w-[200px]"
      />
    );
  },
};

// Full width
export const FullWidth: Story = {
  render: function FullWidthNumberInput() {
    const [value, setValue] = useState<number | undefined>(50);
    return (
      <div className="w-full max-w-md">
        <NumberInput value={value} onChange={setValue} label="Full Width Input" fullWidth />
      </div>
    );
  },
};

// LLM settings example
export const LLMSettings: Story = {
  render: function LLMSettingsExample() {
    const [maxTokens, setMaxTokens] = useState<number | undefined>(2048);
    const [temperature, setTemperature] = useState<number | undefined>(0.7);
    const [topP, setTopP] = useState<number | undefined>(1.0);
    const [frequencyPenalty, setFrequencyPenalty] = useState<number | undefined>(0);

    return (
      <div className="w-[300px] space-y-4 p-4 border rounded-lg">
        <h3 className="font-medium">Model Parameters</h3>
        <NumberInput
          value={maxTokens}
          onChange={setMaxTokens}
          label="Max Tokens"
          min={1}
          max={8192}
          step={1}
          helperText="Maximum tokens to generate"
        />
        <NumberInput
          value={temperature}
          onChange={setTemperature}
          label="Temperature"
          min={0}
          max={2}
          step={0.1}
          allowDecimals
          helperText="Higher = more random"
        />
        <NumberInput
          value={topP}
          onChange={setTopP}
          label="Top P"
          min={0}
          max={1}
          step={0.1}
          allowDecimals
        />
        <NumberInput
          value={frequencyPenalty}
          onChange={setFrequencyPenalty}
          label="Frequency Penalty"
          min={-2}
          max={2}
          step={0.1}
          allowDecimals
        />
      </div>
    );
  },
};
