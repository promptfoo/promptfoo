import { Separator } from './separator';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Separator> = {
  title: 'UI/Separator',
  component: Separator,
  tags: ['autodocs'],
  argTypes: {
    orientation: {
      control: 'select',
      options: ['horizontal', 'vertical'],
      description: 'The orientation of the separator',
    },
    decorative: {
      control: 'boolean',
      description: 'Whether the separator is purely decorative',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Separator>;

// Default (horizontal)
export const Default: Story = {
  render: () => (
    <div className="w-full">
      <Separator />
    </div>
  ),
};

// Horizontal with content
export const HorizontalWithContent: Story = {
  render: () => (
    <div className="w-[400px]">
      <div className="space-y-1">
        <h4 className="text-sm font-medium leading-none">Radix Primitives</h4>
        <p className="text-sm text-muted-foreground">An open-source UI component library.</p>
      </div>
      <Separator className="my-4" />
      <div className="flex h-5 items-center space-x-4 text-sm">
        <div>Blog</div>
        <Separator orientation="vertical" />
        <div>Docs</div>
        <Separator orientation="vertical" />
        <div>Source</div>
      </div>
    </div>
  ),
};

// Vertical
export const Vertical: Story = {
  render: () => (
    <div className="flex h-5 items-center space-x-4 text-sm">
      <div>Item 1</div>
      <Separator orientation="vertical" />
      <div>Item 2</div>
      <Separator orientation="vertical" />
      <div>Item 3</div>
    </div>
  ),
};

// In a card
export const InCard: Story = {
  render: () => (
    <div className="w-[350px] rounded-lg border p-4">
      <h3 className="font-medium">Account Settings</h3>
      <p className="text-sm text-muted-foreground">Manage your account preferences</p>
      <Separator className="my-4" />
      <div className="space-y-3">
        <div className="flex justify-between">
          <span className="text-sm">Email</span>
          <span className="text-sm text-muted-foreground">user@example.com</span>
        </div>
        <Separator />
        <div className="flex justify-between">
          <span className="text-sm">Plan</span>
          <span className="text-sm text-muted-foreground">Pro</span>
        </div>
        <Separator />
        <div className="flex justify-between">
          <span className="text-sm">Status</span>
          <span className="text-sm text-emerald-600">Active</span>
        </div>
      </div>
    </div>
  ),
};

// Navigation example
export const Navigation: Story = {
  render: () => (
    <div className="flex items-center space-x-2 text-sm">
      <a href="#" className="text-primary hover:underline">
        Home
      </a>
      <Separator orientation="vertical" className="h-4" />
      <a href="#" className="text-primary hover:underline">
        Products
      </a>
      <Separator orientation="vertical" className="h-4" />
      <a href="#" className="text-primary hover:underline">
        Pricing
      </a>
      <Separator orientation="vertical" className="h-4" />
      <a href="#" className="text-primary hover:underline">
        Contact
      </a>
    </div>
  ),
};

// Section divider
export const SectionDivider: Story = {
  render: () => (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold mb-2">Section One</h2>
        <p className="text-sm text-muted-foreground">
          Content for the first section goes here. This demonstrates how separators can be used to
          divide page sections.
        </p>
      </section>
      <Separator />
      <section>
        <h2 className="text-lg font-semibold mb-2">Section Two</h2>
        <p className="text-sm text-muted-foreground">
          Content for the second section goes here. The separator above creates visual distinction
          between sections.
        </p>
      </section>
      <Separator />
      <section>
        <h2 className="text-lg font-semibold mb-2">Section Three</h2>
        <p className="text-sm text-muted-foreground">Content for the third section goes here.</p>
      </section>
    </div>
  ),
};
