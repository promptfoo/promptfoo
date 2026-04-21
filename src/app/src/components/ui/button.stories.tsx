import { Download, Loader2, Mail, Plus } from 'lucide-react';
import { Button } from './button';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link', 'nav'],
      description: 'The visual style of the button',
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'icon'],
      description: 'The size of the button',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the button is disabled',
    },
    asChild: {
      control: 'boolean',
      description: 'Whether to render as a child element',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

// Default button
export const Default: Story = {
  args: {
    children: 'Button',
  },
};

// All variants
export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button variant="default">Default</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
      <Button variant="nav">Nav</Button>
    </div>
  ),
};

// All sizes
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
      <Button size="icon">
        <Plus className="size-4" />
      </Button>
    </div>
  ),
};

// Disabled state
export const Disabled: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button disabled>Default Disabled</Button>
      <Button variant="destructive" disabled>
        Destructive Disabled
      </Button>
      <Button variant="outline" disabled>
        Outline Disabled
      </Button>
      <Button variant="secondary" disabled>
        Secondary Disabled
      </Button>
      <Button variant="ghost" disabled>
        Ghost Disabled
      </Button>
    </div>
  ),
};

// With icons
export const WithIcon: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button>
        <Mail className="size-4" />
        Login with Email
      </Button>
      <Button variant="outline">
        <Download className="size-4" />
        Download
      </Button>
      <Button variant="secondary">
        <Plus className="size-4" />
        Add Item
      </Button>
    </div>
  ),
};

// Loading state
export const Loading: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button disabled>
        <Loader2 className="size-4 animate-spin" />
        Please wait
      </Button>
      <Button variant="outline" disabled>
        <Loader2 className="size-4 animate-spin" />
        Loading...
      </Button>
    </div>
  ),
};

// Icon only buttons
export const IconOnly: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Button size="icon" variant="default" aria-label="Add">
        <Plus className="size-4" />
      </Button>
      <Button size="icon" variant="outline" aria-label="Download">
        <Download className="size-4" />
      </Button>
      <Button size="icon" variant="ghost" aria-label="Mail">
        <Mail className="size-4" />
      </Button>
      <Button size="icon" variant="destructive" aria-label="Delete">
        <Plus className="size-4 rotate-45" />
      </Button>
    </div>
  ),
};

// As link
export const AsLink: Story = {
  render: () => (
    <Button asChild variant="link">
      <a href="https://example.com">Visit Website</a>
    </Button>
  ),
};
