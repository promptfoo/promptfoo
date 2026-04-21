import { HelperText } from './helper-text';
import { Input } from './input';
import { Label } from './label';
import { Textarea } from './textarea';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof HelperText> = {
  title: 'UI/HelperText',
  component: HelperText,
  tags: ['autodocs'],
  argTypes: {
    error: {
      control: 'boolean',
      description: 'Whether to show error styling',
    },
    children: {
      control: 'text',
      description: 'The helper text content',
    },
  },
};

export default meta;
type Story = StoryObj<typeof HelperText>;

// Default helper text
export const Default: Story = {
  args: {
    children: 'This is helper text that provides additional context.',
  },
};

// Error state
export const Error: Story = {
  args: {
    children: 'This field is required.',
    error: true,
  },
};

// With input field
export const WithInput: Story = {
  render: () => (
    <div className="flex flex-col w-full max-w-sm">
      <Label htmlFor="email">Email</Label>
      <Input type="email" id="email" placeholder="email@example.com" />
      <HelperText>We'll never share your email with anyone.</HelperText>
    </div>
  ),
};

// With input field in error state
export const WithInputError: Story = {
  render: () => (
    <div className="flex flex-col w-full max-w-sm">
      <Label htmlFor="email-error" className="mb-2 text-destructive">
        Email
      </Label>
      <Input
        type="email"
        id="email-error"
        placeholder="email@example.com"
        className="border-destructive focus-visible:ring-destructive"
      />
      <HelperText error>Please enter a valid email address.</HelperText>
    </div>
  ),
};

// With textarea
export const WithTextarea: Story = {
  render: () => (
    <div className="flex flex-col w-full max-w-sm">
      <Label htmlFor="bio">Bio</Label>
      <Textarea id="bio" placeholder="Tell us about yourself" />
      <HelperText>You can @mention other users and organizations.</HelperText>
    </div>
  ),
};

// Multiple fields
export const FormExample: Story = {
  render: () => (
    <div className="space-y-4 w-full max-w-sm">
      <div className="flex flex-col">
        <Label htmlFor="username">Username</Label>
        <Input type="text" id="username" placeholder="johndoe" />
        <HelperText>This will be your public display name.</HelperText>
      </div>
      <div className="flex flex-col">
        <Label htmlFor="password">Password</Label>
        <Input type="password" id="password" placeholder="Enter password" />
        <HelperText>Must be at least 8 characters long.</HelperText>
      </div>
      <div className="flex flex-col">
        <Label htmlFor="confirm" className="mb-2 text-destructive">
          Confirm Password
        </Label>
        <Input
          type="password"
          id="confirm"
          placeholder="Confirm password"
          className="border-destructive focus-visible:ring-destructive"
        />
        <HelperText error>Passwords do not match.</HelperText>
      </div>
    </div>
  ),
};
