import { useState } from 'react';

import { Label } from './label';
import { RadioGroup, RadioGroupItem } from './radio-group';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof RadioGroup> = {
  title: 'UI/RadioGroup',
  component: RadioGroup,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof RadioGroup>;

// Default radio group
export const Default: Story = {
  render: () => (
    <RadioGroup defaultValue="option1">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option1" id="option1" />
        <Label htmlFor="option1">Option 1</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option2" id="option2" />
        <Label htmlFor="option2">Option 2</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option3" id="option3" />
        <Label htmlFor="option3">Option 3</Label>
      </div>
    </RadioGroup>
  ),
};

// Controlled
export const Controlled: Story = {
  render: function ControlledRadioGroup() {
    const [value, setValue] = useState('gpt-4');

    return (
      <div className="space-y-4">
        <RadioGroup value={value} onValueChange={setValue}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="gpt-4" id="gpt-4" />
            <Label htmlFor="gpt-4">GPT-4</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="gpt-3.5" id="gpt-3.5" />
            <Label htmlFor="gpt-3.5">GPT-3.5 Turbo</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="claude" id="claude" />
            <Label htmlFor="claude">Claude 3</Label>
          </div>
        </RadioGroup>
        <p className="text-sm text-muted-foreground">Selected: {value}</p>
      </div>
    );
  },
};

// With descriptions
export const WithDescriptions: Story = {
  render: () => (
    <RadioGroup defaultValue="comfortable" className="space-y-3">
      <div className="flex items-start space-x-3">
        <RadioGroupItem value="default" id="default" className="mt-1" />
        <div className="grid gap-1">
          <Label htmlFor="default" className="font-medium">
            Default
          </Label>
          <p className="text-sm text-muted-foreground">Uses the default system settings.</p>
        </div>
      </div>
      <div className="flex items-start space-x-3">
        <RadioGroupItem value="comfortable" id="comfortable" className="mt-1" />
        <div className="grid gap-1">
          <Label htmlFor="comfortable" className="font-medium">
            Comfortable
          </Label>
          <p className="text-sm text-muted-foreground">More padding for better readability.</p>
        </div>
      </div>
      <div className="flex items-start space-x-3">
        <RadioGroupItem value="compact" id="compact" className="mt-1" />
        <div className="grid gap-1">
          <Label htmlFor="compact" className="font-medium">
            Compact
          </Label>
          <p className="text-sm text-muted-foreground">Reduced spacing for dense layouts.</p>
        </div>
      </div>
    </RadioGroup>
  ),
};

// Horizontal layout
export const Horizontal: Story = {
  render: () => (
    <RadioGroup defaultValue="medium" className="flex space-x-4">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="small" id="h-small" />
        <Label htmlFor="h-small">Small</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="medium" id="h-medium" />
        <Label htmlFor="h-medium">Medium</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="large" id="h-large" />
        <Label htmlFor="h-large">Large</Label>
      </div>
    </RadioGroup>
  ),
};

// Disabled states
export const Disabled: Story = {
  render: () => (
    <RadioGroup defaultValue="enabled">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="enabled" id="enabled" />
        <Label htmlFor="enabled">Enabled option</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="disabled" id="disabled" disabled />
        <Label htmlFor="disabled" className="text-muted-foreground">
          Disabled option
        </Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="another" id="another" />
        <Label htmlFor="another">Another enabled option</Label>
      </div>
    </RadioGroup>
  ),
};

// Card selection
export const CardSelection: Story = {
  render: function CardRadioGroup() {
    const [plan, setPlan] = useState('pro');

    return (
      <RadioGroup value={plan} onValueChange={setPlan} className="grid grid-cols-3 gap-4">
        {[
          { value: 'free', name: 'Free', price: '$0', features: ['Basic features', '1 project'] },
          {
            value: 'pro',
            name: 'Pro',
            price: '$19/mo',
            features: ['All features', 'Unlimited projects'],
          },
          {
            value: 'enterprise',
            name: 'Enterprise',
            price: 'Custom',
            features: ['Everything', 'Priority support'],
          },
        ].map((option) => (
          <div key={option.value}>
            <RadioGroupItem value={option.value} id={option.value} className="peer sr-only" />
            <Label
              htmlFor={option.value}
              className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-transparent p-4 hover:bg-muted/50 peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
            >
              <span className="font-semibold">{option.name}</span>
              <span className="text-2xl font-bold mt-2">{option.price}</span>
              <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                {option.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </Label>
          </div>
        ))}
      </RadioGroup>
    );
  },
};

// All states
export const AllStates: Story = {
  render: () => (
    <div className="flex gap-8">
      <div className="space-y-2">
        <p className="text-sm font-medium">Unchecked</p>
        <RadioGroup>
          <RadioGroupItem value="unchecked" id="unchecked" />
        </RadioGroup>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Checked</p>
        <RadioGroup defaultValue="checked">
          <RadioGroupItem value="checked" id="checked" />
        </RadioGroup>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Disabled</p>
        <RadioGroup>
          <RadioGroupItem value="disabled-item" id="disabled-item" disabled />
        </RadioGroup>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Disabled Checked</p>
        <RadioGroup defaultValue="disabled-checked">
          <RadioGroupItem value="disabled-checked" id="disabled-checked" disabled />
        </RadioGroup>
      </div>
    </div>
  ),
};
