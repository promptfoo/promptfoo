import { Spinner } from './spinner';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Spinner> = {
  title: 'UI/Spinner',
  component: Spinner,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'The size of the spinner',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Spinner>;

// Default spinner
export const Default: Story = {
  args: {},
};

// All sizes
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-8">
      <div className="flex flex-col items-center gap-2">
        <Spinner size="sm" />
        <span className="text-sm text-muted-foreground">Small</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size="md" />
        <span className="text-sm text-muted-foreground">Medium</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size="lg" />
        <span className="text-sm text-muted-foreground">Large</span>
      </div>
    </div>
  ),
};

// In button
export const InButton: Story = {
  render: () => (
    <button className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md">
      <Spinner size="sm" className="[&_svg]:text-primary-foreground" />
      Loading...
    </button>
  ),
};

// Loading state
export const LoadingState: Story = {
  render: () => (
    <div className="flex flex-col items-center justify-center p-8 border rounded-lg">
      <Spinner size="lg" />
      <p className="mt-4 text-sm text-muted-foreground">Loading content...</p>
    </div>
  ),
};

// Page loading
export const PageLoading: Story = {
  render: () => (
    <div className="flex flex-col items-center justify-center min-h-[200px]">
      <Spinner size="lg" />
      <p className="mt-4 text-muted-foreground">Loading your data</p>
      <p className="text-sm text-muted-foreground">This may take a moment</p>
    </div>
  ),
};

// Inline with text
export const InlineWithText: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Spinner size="sm" />
      <span className="text-sm">Processing your request...</span>
    </div>
  ),
};

// In card
export const InCard: Story = {
  render: () => (
    <div className="w-[300px] p-6 border rounded-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium">Test Results</h3>
        <Spinner size="sm" />
      </div>
      <p className="text-sm text-muted-foreground">Running evaluation tests...</p>
    </div>
  ),
};
