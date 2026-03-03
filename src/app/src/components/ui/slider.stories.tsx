import { useState } from 'react';

import { Label } from './label';
import { Slider } from './slider';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Slider> = {
  title: 'UI/Slider',
  component: Slider,
  tags: ['autodocs'],
  argTypes: {
    defaultValue: {
      control: { type: 'object' },
      description: 'The default value(s) of the slider',
    },
    min: {
      control: 'number',
      description: 'The minimum value',
    },
    max: {
      control: 'number',
      description: 'The maximum value',
    },
    step: {
      control: 'number',
      description: 'The step increment',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the slider is disabled',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Slider>;

// Default slider
export const Default: Story = {
  args: {
    defaultValue: [50],
    max: 100,
    step: 1,
  },
};

// With label
export const WithLabel: Story = {
  render: function SliderWithLabel() {
    const [value, setValue] = useState([50]);

    return (
      <div className="space-y-4 w-[300px]">
        <div className="flex justify-between">
          <Label id="volume-label">Volume</Label>
          <span className="text-sm text-muted-foreground">{value[0]}%</span>
        </div>
        <Slider
          defaultValue={[50]}
          max={100}
          step={1}
          onValueChange={setValue}
          aria-labelledby="volume-label"
        />
      </div>
    );
  },
};

// Different ranges
export const DifferentRanges: Story = {
  render: () => (
    <div className="space-y-6 w-[300px]">
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>0-100</span>
          <span className="text-muted-foreground">Default: 50</span>
        </div>
        <Slider defaultValue={[50]} max={100} step={1} />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>0-10</span>
          <span className="text-muted-foreground">Default: 5</span>
        </div>
        <Slider defaultValue={[5]} max={10} step={1} />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>0-1 (step 0.1)</span>
          <span className="text-muted-foreground">Default: 0.7</span>
        </div>
        <Slider defaultValue={[0.7]} max={1} step={0.1} />
      </div>
    </div>
  ),
};

// Temperature control (common LLM setting)
export const TemperatureControl: Story = {
  render: function TemperatureSlider() {
    const [temperature, setTemperature] = useState([0.7]);

    return (
      <div className="space-y-4 w-[300px]">
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label id="temp-label">Temperature</Label>
            <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
              {temperature[0].toFixed(1)}
            </span>
          </div>
          <Slider
            defaultValue={[0.7]}
            max={2}
            min={0}
            step={0.1}
            onValueChange={setTemperature}
            aria-labelledby="temp-label"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Deterministic</span>
            <span>Creative</span>
          </div>
        </div>
      </div>
    );
  },
};

// Disabled state
export const Disabled: Story = {
  args: {
    defaultValue: [50],
    max: 100,
    step: 1,
    disabled: true,
  },
};

// Max tokens example
export const MaxTokens: Story = {
  render: function MaxTokensSlider() {
    const [tokens, setTokens] = useState([2048]);

    return (
      <div className="space-y-4 w-[300px]">
        <div className="flex justify-between">
          <Label id="tokens-label">Max Tokens</Label>
          <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{tokens[0]}</span>
        </div>
        <Slider
          defaultValue={[2048]}
          max={8192}
          min={1}
          step={1}
          onValueChange={setTokens}
          aria-labelledby="tokens-label"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>1</span>
          <span>8192</span>
        </div>
      </div>
    );
  },
};

// All states
export const AllStates: Story = {
  render: () => (
    <div className="space-y-6 w-[300px]">
      <div className="space-y-2">
        <p className="text-sm font-medium">Default</p>
        <Slider defaultValue={[50]} max={100} step={1} />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">At minimum</p>
        <Slider defaultValue={[0]} max={100} step={1} />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">At maximum</p>
        <Slider defaultValue={[100]} max={100} step={1} />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Disabled</p>
        <Slider defaultValue={[50]} max={100} step={1} disabled />
      </div>
    </div>
  ),
};
