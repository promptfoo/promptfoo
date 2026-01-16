import { ChevronDown, Copy, X } from 'lucide-react';
import { Chip } from './chip';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Chip> = {
  title: 'UI/Chip',
  component: Chip,
  tags: ['autodocs'],
  argTypes: {
    label: {
      control: 'text',
      description: 'The label displayed as a prefix',
    },
    interactive: {
      control: 'boolean',
      description: 'Whether the chip is interactive (clickable)',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the chip is disabled',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Chip>;

// Default chip
export const Default: Story = {
  args: {
    label: 'EVAL',
    children: 'eval-abc123',
  },
};

// With trailing icon
export const WithTrailingIcon: Story = {
  args: {
    label: 'ID',
    children: 'abc-123-xyz',
    trailingIcon: <Copy className="size-3" />,
  },
};

// Different labels
export const DifferentLabels: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Chip label="EVAL">eval-2024-01</Chip>
      <Chip label="ID">abc123</Chip>
      <Chip label="AUTHOR">john@example.com</Chip>
      <Chip label="MODEL">gpt-4</Chip>
      <Chip label="VERSION">1.2.3</Chip>
    </div>
  ),
};

// Non-interactive
export const NonInteractive: Story = {
  args: {
    label: 'STATUS',
    children: 'Running',
    interactive: false,
  },
};

// Disabled
export const Disabled: Story = {
  args: {
    label: 'EVAL',
    children: 'disabled-chip',
    disabled: true,
  },
};

// With dropdown indicator
export const WithDropdown: Story = {
  render: () => (
    <Chip label="FILTER" trailingIcon={<ChevronDown className="size-3" />}>
      All Results
    </Chip>
  ),
};

// Removable chip
export const Removable: Story = {
  render: () => (
    <Chip label="TAG" trailingIcon={<X className="size-3 hover:text-destructive" />}>
      security
    </Chip>
  ),
};

// In context
export const InContext: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Evaluation:</span>
        <Chip label="EVAL">redteam-security-2024</Chip>
        <Chip label="ID" trailingIcon={<Copy className="size-3" />}>
          abc123xyz
        </Chip>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Configuration:</span>
        <Chip label="MODEL">gpt-4-turbo</Chip>
        <Chip label="TEMP">0.7</Chip>
        <Chip label="TOKENS">4096</Chip>
      </div>
    </div>
  ),
};

// All states
export const AllStates: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <span className="text-sm w-24">Default:</span>
        <Chip label="LABEL">Content</Chip>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm w-24">With icon:</span>
        <Chip label="LABEL" trailingIcon={<ChevronDown className="size-3" />}>
          Content
        </Chip>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm w-24">Non-interactive:</span>
        <Chip label="LABEL" interactive={false}>
          Content
        </Chip>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm w-24">Disabled:</span>
        <Chip label="LABEL" disabled>
          Content
        </Chip>
      </div>
    </div>
  ),
};
