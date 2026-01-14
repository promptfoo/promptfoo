import { AlertCircle, CheckCircle, Info as InfoIcon, Terminal, TriangleAlert } from 'lucide-react';
import { Alert, AlertContent, AlertDescription, AlertTitle } from './alert';
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
      <AlertContent>
        <AlertTitle>Heads up!</AlertTitle>
        <AlertDescription>
          You can add components and dependencies to your app using the cli.
        </AlertDescription>
      </AlertContent>
    </Alert>
  ),
};

// Destructive alert
export const Destructive: Story = {
  render: () => (
    <Alert variant="destructive">
      <AlertCircle className="size-4" />
      <AlertContent>
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          Your session has expired. Please log in again to continue.
        </AlertDescription>
      </AlertContent>
    </Alert>
  ),
};

// Warning alert
export const Warning: Story = {
  render: () => (
    <Alert variant="warning">
      <TriangleAlert className="size-4" />
      <AlertContent>
        <AlertTitle>Warning</AlertTitle>
        <AlertDescription>
          Your API rate limit is approaching. Consider upgrading your plan for higher limits.
        </AlertDescription>
      </AlertContent>
    </Alert>
  ),
};

// Success alert
export const Success: Story = {
  render: () => (
    <Alert variant="success">
      <CheckCircle className="size-4" />
      <AlertContent>
        <AlertTitle>Success</AlertTitle>
        <AlertDescription>Your changes have been saved successfully.</AlertDescription>
      </AlertContent>
    </Alert>
  ),
};

// Info alert
export const Info: Story = {
  render: () => (
    <Alert variant="info">
      <InfoIcon className="size-4" />
      <AlertContent>
        <AlertTitle>Information</AlertTitle>
        <AlertDescription>
          A new version of the application is available. Refresh to update.
        </AlertDescription>
      </AlertContent>
    </Alert>
  ),
};

// All variants
export const AllVariants: Story = {
  render: () => (
    <div className="space-y-4">
      <Alert>
        <Terminal className="size-4" />
        <AlertContent>
          <AlertTitle>Default</AlertTitle>
          <AlertDescription>This is a default alert message.</AlertDescription>
        </AlertContent>
      </Alert>
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertContent>
          <AlertTitle>Destructive</AlertTitle>
          <AlertDescription>This is a destructive alert message.</AlertDescription>
        </AlertContent>
      </Alert>
      <Alert variant="warning">
        <TriangleAlert className="size-4" />
        <AlertContent>
          <AlertTitle>Warning</AlertTitle>
          <AlertDescription>This is a warning alert message.</AlertDescription>
        </AlertContent>
      </Alert>
      <Alert variant="success">
        <CheckCircle className="size-4" />
        <AlertContent>
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>This is a success alert message.</AlertDescription>
        </AlertContent>
      </Alert>
      <Alert variant="info">
        <InfoIcon className="size-4" />
        <AlertContent>
          <AlertTitle>Info</AlertTitle>
          <AlertDescription>This is an info alert message.</AlertDescription>
        </AlertContent>
      </Alert>
    </div>
  ),
};

// Without icon
export const WithoutIcon: Story = {
  render: () => (
    <Alert>
      <AlertContent>
        <AlertTitle>Note</AlertTitle>
        <AlertDescription>Alerts can be displayed without icons when appropriate.</AlertDescription>
      </AlertContent>
    </Alert>
  ),
};

// Description only
export const DescriptionOnly: Story = {
  render: () => (
    <Alert variant="info">
      <InfoIcon className="size-4" />
      <AlertContent>
        <AlertDescription>A simple alert message without a title.</AlertDescription>
      </AlertContent>
    </Alert>
  ),
};
