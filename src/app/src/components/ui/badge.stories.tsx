import { Badge } from './badge';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Badge> = {
  title: 'UI/Badge',
  component: Badge,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'default',
        'secondary',
        'destructive',
        'outline',
        'critical',
        'high',
        'medium',
        'low',
        'info',
        'success',
        'warning',
      ],
      description: 'The visual style of the badge',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Badge>;

// Default badge
export const Default: Story = {
  args: {
    children: 'Badge',
  },
};

// All variants
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="default">Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  ),
};

// Severity variants (used for risk levels)
export const SeverityVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="critical">Critical</Badge>
      <Badge variant="high">High</Badge>
      <Badge variant="medium">Medium</Badge>
      <Badge variant="low">Low</Badge>
    </div>
  ),
};

// Status variants
export const StatusVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="success">Success</Badge>
      <Badge variant="warning">Warning</Badge>
      <Badge variant="info">Info</Badge>
    </div>
  ),
};

// With numbers
export const WithNumbers: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="default">42</Badge>
      <Badge variant="destructive">99+</Badge>
      <Badge variant="outline">3</Badge>
    </div>
  ),
};

// In context (example usage)
export const InContext: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Vulnerability Assessment</span>
        <Badge variant="critical">12 Critical</Badge>
        <Badge variant="high">24 High</Badge>
        <Badge variant="medium">48 Medium</Badge>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Test Results</span>
        <Badge variant="success">85 Passed</Badge>
        <Badge variant="destructive">5 Failed</Badge>
      </div>
    </div>
  ),
};
