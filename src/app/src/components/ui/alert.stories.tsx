import { AlertCircle, CheckCircle, Info as InfoIcon, Terminal, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './alert';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Alert> = {
  title: 'UI/Alert',
  component: Alert,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'warning', 'success', 'info'],
      description: 'The visual style of the alert',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Alert>;

// Default alert
export const Default: Story = {
  render: () => (
    <Alert>
      <Terminal className="size-4" />
      <AlertTitle>Heads up!</AlertTitle>
      <AlertDescription>
        You can add components and dependencies to your app using the cli.
      </AlertDescription>
    </Alert>
  ),
};

// Destructive alert
export const Destructive: Story = {
  render: () => (
    <Alert variant="destructive">
      <AlertCircle className="size-4" />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>
        Your session has expired. Please log in again to continue.
      </AlertDescription>
    </Alert>
  ),
};

// Warning alert
export const Warning: Story = {
  render: () => (
    <Alert variant="warning">
      <TriangleAlert className="size-4" />
      <AlertTitle>Warning</AlertTitle>
      <AlertDescription>
        Your API rate limit is approaching. Consider upgrading your plan for higher limits.
      </AlertDescription>
    </Alert>
  ),
};

// Success alert
export const Success: Story = {
  render: () => (
    <Alert variant="success">
      <CheckCircle className="size-4" />
      <AlertTitle>Success</AlertTitle>
      <AlertDescription>Your changes have been saved successfully.</AlertDescription>
    </Alert>
  ),
};

// Info alert
export const Info: Story = {
  render: () => (
    <Alert variant="info">
      <InfoIcon className="size-4" />
      <AlertTitle>Information</AlertTitle>
      <AlertDescription>
        A new version of the application is available. Refresh to update.
      </AlertDescription>
    </Alert>
  ),
};

// All variants
export const AllVariants: Story = {
  render: () => (
    <div className="space-y-4">
      <Alert>
        <Terminal className="size-4" />
        <AlertTitle>Default</AlertTitle>
        <AlertDescription>This is a default alert message.</AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertTitle>Destructive</AlertTitle>
        <AlertDescription>This is a destructive alert message.</AlertDescription>
      </Alert>
      <Alert variant="warning">
        <TriangleAlert className="size-4" />
        <AlertTitle>Warning</AlertTitle>
        <AlertDescription>This is a warning alert message.</AlertDescription>
      </Alert>
      <Alert variant="success">
        <CheckCircle className="size-4" />
        <AlertTitle>Success</AlertTitle>
        <AlertDescription>This is a success alert message.</AlertDescription>
      </Alert>
      <Alert variant="info">
        <InfoIcon className="size-4" />
        <AlertTitle>Info</AlertTitle>
        <AlertDescription>This is an info alert message.</AlertDescription>
      </Alert>
    </div>
  ),
};

// Without icon
export const WithoutIcon: Story = {
  render: () => (
    <Alert>
      <AlertTitle>Note</AlertTitle>
      <AlertDescription>Alerts can be displayed without icons when appropriate.</AlertDescription>
    </Alert>
  ),
};

// Description only
export const DescriptionOnly: Story = {
  render: () => (
    <Alert variant="info">
      <InfoIcon className="size-4" />
      <AlertDescription>A simple alert message without a title.</AlertDescription>
    </Alert>
  ),
};
