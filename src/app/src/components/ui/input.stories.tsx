import { HelperText } from './helper-text';
import { Input } from './input';
import { Label } from './label';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Input> = {
  title: 'UI/Input',
  component: Input,
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['text', 'email', 'password', 'number', 'search', 'tel', 'url'],
      description: 'The type of input',
    },
    placeholder: {
      control: 'text',
      description: 'Placeholder text',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the input is disabled',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Input>;

// Default input
export const Default: Story = {
  args: {
    placeholder: 'Enter text...',
  },
};

// With label
export const WithLabel: Story = {
  render: () => (
    <div className="flex flex-col w-full max-w-sm">
      <Label htmlFor="email">Email</Label>
      <Input type="email" id="email" placeholder="Email" />
    </div>
  ),
};

// Different types
export const Types: Story = {
  render: () => (
    <div className="space-y-4 w-full max-w-sm">
      <div className="flex flex-col">
        <Label htmlFor="text">Text</Label>
        <Input type="text" id="text" placeholder="Enter text..." />
        <HelperText>Enter any text value</HelperText>
      </div>
      <div className="flex flex-col">
        <Label htmlFor="email-type">Email</Label>
        <Input type="email" id="email-type" placeholder="email@example.com" />
        <HelperText>We'll never share your email</HelperText>
      </div>
      <div className="flex flex-col">
        <Label htmlFor="password">Password</Label>
        <Input type="password" id="password" placeholder="Enter password..." />
        <HelperText>Must be at least 8 characters</HelperText>
      </div>
      <div className="flex flex-col">
        <Label htmlFor="number">Number</Label>
        <Input type="number" id="number" placeholder="0" />
        <HelperText>Enter a numeric value</HelperText>
      </div>
      <div className="flex flex-col">
        <Label htmlFor="search">Search</Label>
        <Input type="search" id="search" placeholder="Search..." />
        <HelperText>Search across all items</HelperText>
      </div>
    </div>
  ),
};

// Disabled state
export const Disabled: Story = {
  args: {
    placeholder: 'Disabled input',
    disabled: true,
  },
};

// With default value
export const WithValue: Story = {
  args: {
    defaultValue: 'Hello World',
  },
};

// File input
export const File: Story = {
  render: () => (
    <div className="flex flex-col w-full max-w-sm">
      <Label htmlFor="picture">Picture</Label>
      <Input id="picture" type="file" />
    </div>
  ),
};

// Required input
export const Required: Story = {
  render: () => (
    <div className="flex flex-col w-full max-w-sm">
      <Label htmlFor="required">
        Required Field <span className="text-destructive">*</span>
      </Label>
      <Input id="required" required placeholder="This field is required" />
    </div>
  ),
};

// Read-only input
export const ReadOnly: Story = {
  args: {
    defaultValue: 'Read-only value',
    readOnly: true,
  },
};
