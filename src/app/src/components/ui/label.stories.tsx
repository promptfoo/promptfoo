import { Checkbox } from './checkbox';
import { HelperText } from './helper-text';
import { Input } from './input';
import { Label } from './label';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Label> = {
  title: 'UI/Label',
  component: Label,
  tags: ['autodocs'],
  argTypes: {
    htmlFor: {
      control: 'text',
      description: 'The ID of the element the label is for',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Label>;

// Default label
export const Default: Story = {
  args: {
    children: 'Label',
  },
};

// With input
export const WithInput: Story = {
  render: () => (
    <div className="flex flex-col w-full max-w-sm">
      <Label htmlFor="email">Email</Label>
      <Input type="email" id="email" placeholder="Email" />
    </div>
  ),
};

// With checkbox
export const WithCheckbox: Story = {
  render: () => (
    <div className="flex items-center space-x-2">
      <Checkbox id="terms" />
      <Label htmlFor="terms" inline>
        Accept terms and conditions
      </Label>
    </div>
  ),
};

// Required field
export const Required: Story = {
  render: () => (
    <div className="flex flex-col w-full max-w-sm">
      <Label htmlFor="username">
        Username <span className="text-destructive">*</span>
      </Label>
      <Input type="text" id="username" placeholder="Username" required />
    </div>
  ),
};

// Disabled state
export const Disabled: Story = {
  render: () => (
    <div className="flex flex-col w-full max-w-sm">
      <Label htmlFor="disabled" className="text-muted-foreground">
        Disabled Field
      </Label>
      <Input type="text" id="disabled" placeholder="Disabled" disabled />
    </div>
  ),
};

// With helper text
export const WithHelperText: Story = {
  render: () => (
    <div className="flex flex-col w-full max-w-sm">
      <Label htmlFor="password">Password</Label>
      <Input type="password" id="password" placeholder="Enter password" />
      <HelperText>Must be at least 8 characters long</HelperText>
    </div>
  ),
};

// Form layout
export const FormLayout: Story = {
  render: () => (
    <div className="space-y-4 w-full max-w-sm">
      <div className="flex flex-col">
        <Label htmlFor="firstName">First Name</Label>
        <Input id="firstName" placeholder="John" />
      </div>
      <div className="flex flex-col">
        <Label htmlFor="lastName">Last Name</Label>
        <Input id="lastName" placeholder="Doe" />
      </div>
      <div className="flex flex-col">
        <Label htmlFor="email-form">Email</Label>
        <Input id="email-form" type="email" placeholder="john@example.com" />
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox id="newsletter" />
        <Label htmlFor="newsletter" inline>
          Subscribe to newsletter
        </Label>
      </div>
    </div>
  ),
};
