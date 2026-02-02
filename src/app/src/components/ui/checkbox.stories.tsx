import { useState } from 'react';

import { Checkbox } from './checkbox';
import { Label } from './label';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Checkbox> = {
  title: 'UI/Checkbox',
  component: Checkbox,
  tags: ['autodocs'],
  argTypes: {
    checked: {
      control: 'boolean',
      description: 'Whether the checkbox is checked',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the checkbox is disabled',
    },
    indeterminate: {
      control: 'boolean',
      description: 'Whether the checkbox is in indeterminate state',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Checkbox>;

// Default checkbox
export const Default: Story = {
  args: {},
};

// Checked state
export const Checked: Story = {
  args: {
    checked: true,
  },
};

// With label
export const WithLabel: Story = {
  render: () => (
    <div className="flex items-center space-x-2">
      <Checkbox id="terms" />
      <Label htmlFor="terms" inline>
        Accept terms and conditions
      </Label>
    </div>
  ),
};

// Disabled states
export const Disabled: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Checkbox id="disabled-unchecked" disabled />
        <Label htmlFor="disabled-unchecked" inline className="text-muted-foreground">
          Disabled unchecked
        </Label>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox id="disabled-checked" disabled checked />
        <Label htmlFor="disabled-checked" inline className="text-muted-foreground">
          Disabled checked
        </Label>
      </div>
    </div>
  ),
};

// Indeterminate state
export const Indeterminate: Story = {
  args: {
    indeterminate: true,
  },
};

// Interactive example
export const Interactive: Story = {
  render: function InteractiveCheckbox() {
    const [checked, setChecked] = useState(false);
    return (
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="interactive"
            checked={checked}
            onCheckedChange={(value) => setChecked(value === true)}
          />
          <Label htmlFor="interactive" inline>
            Toggle me
          </Label>
        </div>
        <p className="text-sm text-muted-foreground">
          Checkbox is: {checked ? 'checked' : 'unchecked'}
        </p>
      </div>
    );
  },
};

// Checkbox group
export const CheckboxGroup: Story = {
  render: function CheckboxGroupComponent() {
    const [selected, setSelected] = useState<string[]>(['option1']);

    const toggleOption = (option: string) => {
      setSelected((prev) =>
        prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option],
      );
    };

    return (
      <div className="space-y-4">
        <p className="text-sm font-medium">Select your preferences:</p>
        <div className="space-y-2">
          {['option1', 'option2', 'option3'].map((option) => (
            <div key={option} className="flex items-center space-x-2">
              <Checkbox
                id={option}
                checked={selected.includes(option)}
                onCheckedChange={() => toggleOption(option)}
              />
              <Label htmlFor={option} inline>
                {option === 'option1' && 'Email notifications'}
                {option === 'option2' && 'Push notifications'}
                {option === 'option3' && 'SMS notifications'}
              </Label>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">Selected: {selected.join(', ') || 'None'}</p>
      </div>
    );
  },
};

// All states
export const AllStates: Story = {
  render: () => (
    <div className="flex gap-8">
      <div className="space-y-2">
        <p className="text-sm font-medium">Unchecked</p>
        <Checkbox />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Checked</p>
        <Checkbox checked />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Indeterminate</p>
        <Checkbox indeterminate />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Disabled</p>
        <Checkbox disabled />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Disabled Checked</p>
        <Checkbox disabled checked />
      </div>
    </div>
  ),
};
