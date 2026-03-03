import { useState } from 'react';

import { Combobox, type ComboboxOption } from './combobox';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Combobox> = {
  title: 'UI/Combobox',
  component: Combobox,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Combobox>;

const modelOptions: ComboboxOption[] = [
  { value: 'gpt-5', label: 'GPT-5', description: 'Most capable' },
  { value: 'gpt-5-mini', label: 'GPT-5 Mini', description: 'Faster' },
  { value: 'o4-mini', label: 'o4-mini', description: 'Fast & cheap' },
  { value: 'claude-opus-4-6', label: 'Claude 4.6 Opus', description: 'Most capable' },
  { value: 'claude-sonnet-4-5', label: 'Claude 4.5 Sonnet', description: 'Balanced' },
  { value: 'claude-haiku-4-5', label: 'Claude 4.5 Haiku', description: 'Fast' },
];

const frameworkOptions: ComboboxOption[] = [
  { value: 'react', label: 'React' },
  { value: 'vue', label: 'Vue' },
  { value: 'angular', label: 'Angular' },
  { value: 'svelte', label: 'Svelte' },
  { value: 'solid', label: 'SolidJS' },
];

// Default combobox
export const Default: Story = {
  render: function DefaultCombobox() {
    const [value, setValue] = useState('');
    return (
      <div className="w-[300px]">
        <Combobox
          options={frameworkOptions}
          value={value}
          onChange={setValue}
          placeholder="Select framework..."
        />
      </div>
    );
  },
};

// With descriptions
export const WithDescriptions: Story = {
  render: function ComboboxWithDescriptions() {
    const [value, setValue] = useState('');
    return (
      <div className="w-[350px]">
        <Combobox
          options={modelOptions}
          value={value}
          onChange={setValue}
          placeholder="Select a model..."
        />
      </div>
    );
  },
};

// Pre-selected value
export const PreSelected: Story = {
  render: function PreSelectedCombobox() {
    const [value, setValue] = useState('gpt-4');
    return (
      <div className="w-[350px]">
        <Combobox
          options={modelOptions}
          value={value}
          onChange={setValue}
          placeholder="Select a model..."
        />
      </div>
    );
  },
};

// Disabled
export const Disabled: Story = {
  render: function DisabledCombobox() {
    const [value, setValue] = useState('gpt-4');
    return (
      <div className="w-[350px]">
        <Combobox
          options={modelOptions}
          value={value}
          onChange={setValue}
          placeholder="Select a model..."
          disabled
        />
      </div>
    );
  },
};

// Empty message
export const EmptyMessage: Story = {
  render: function EmptyCombobox() {
    const [value, setValue] = useState('');
    return (
      <div className="w-[300px]">
        <Combobox
          options={[]}
          value={value}
          onChange={setValue}
          placeholder="Search..."
          emptyMessage="No options available"
        />
      </div>
    );
  },
};

// Custom empty message
export const CustomEmptyMessage: Story = {
  render: function CustomEmptyCombobox() {
    const [value, setValue] = useState('');
    return (
      <div className="w-[300px]">
        <Combobox
          options={modelOptions}
          value={value}
          onChange={setValue}
          placeholder="Search models..."
          emptyMessage="No models match your search."
        />
      </div>
    );
  },
};

// In form context
export const InForm: Story = {
  render: function FormCombobox() {
    const [model, setModel] = useState('');
    const [framework, setFramework] = useState('');

    return (
      <div className="w-[350px] space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Model</label>
          <Combobox
            options={modelOptions}
            value={model}
            onChange={setModel}
            placeholder="Select a model..."
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Framework</label>
          <Combobox
            options={frameworkOptions}
            value={framework}
            onChange={setFramework}
            placeholder="Select framework..."
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Selected: {model || 'None'}, {framework || 'None'}
        </p>
      </div>
    );
  },
};

// Many options
export const ManyOptions: Story = {
  render: function ManyOptionsCombobox() {
    const [value, setValue] = useState('');
    const options: ComboboxOption[] = Array.from({ length: 50 }, (_, i) => ({
      value: `option-${i + 1}`,
      label: `Option ${i + 1}`,
      description: `Description for option ${i + 1}`,
    }));

    return (
      <div className="w-[300px]">
        <Combobox
          options={options}
          value={value}
          onChange={setValue}
          placeholder="Select an option..."
        />
      </div>
    );
  },
};

// With label
export const WithLabel: Story = {
  render: function LabeledCombobox() {
    const [value, setValue] = useState('');
    return (
      <div className="w-[350px]">
        <Combobox
          label="AI Model"
          options={modelOptions}
          value={value}
          onChange={setValue}
          placeholder="Select a model..."
        />
      </div>
    );
  },
};

// Not clearable
export const NotClearable: Story = {
  render: function NotClearableCombobox() {
    const [value, setValue] = useState('gpt-4');
    return (
      <div className="w-[350px]">
        <Combobox
          options={modelOptions}
          value={value}
          onChange={setValue}
          placeholder="Select a model..."
          clearable={false}
        />
      </div>
    );
  },
};
