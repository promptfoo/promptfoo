import { Gauge } from './gauge';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Gauge> = {
  title: 'UI/Gauge',
  component: Gauge,
  tags: ['autodocs'],
  argTypes: {
    value: {
      control: { type: 'range', min: 0, max: 100, step: 1 },
      description: 'The current value',
    },
    max: {
      control: 'number',
      description: 'The maximum value',
    },
    size: {
      control: 'number',
      description: 'The size of the gauge in pixels',
    },
    strokeWidth: {
      control: 'number',
      description: 'The width of the stroke',
    },
    showValue: {
      control: 'boolean',
      description: 'Whether to show the value text',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Gauge>;

// Default gauge
export const Default: Story = {
  args: {
    value: 75,
  },
};

// Different values
export const DifferentValues: Story = {
  render: () => (
    <div className="flex items-end gap-8">
      <div className="text-center">
        <Gauge value={0} />
        <p className="text-sm text-muted-foreground mt-2">0%</p>
      </div>
      <div className="text-center">
        <Gauge value={25} />
        <p className="text-sm text-muted-foreground mt-2">25%</p>
      </div>
      <div className="text-center">
        <Gauge value={50} />
        <p className="text-sm text-muted-foreground mt-2">50%</p>
      </div>
      <div className="text-center">
        <Gauge value={75} />
        <p className="text-sm text-muted-foreground mt-2">75%</p>
      </div>
      <div className="text-center">
        <Gauge value={100} />
        <p className="text-sm text-muted-foreground mt-2">100%</p>
      </div>
    </div>
  ),
};

// Different sizes
export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-8">
      <div className="text-center">
        <Gauge value={75} size={60} strokeWidth={6} />
        <p className="text-sm text-muted-foreground mt-2">Small</p>
      </div>
      <div className="text-center">
        <Gauge value={75} size={100} strokeWidth={10} />
        <p className="text-sm text-muted-foreground mt-2">Default</p>
      </div>
      <div className="text-center">
        <Gauge value={75} size={150} strokeWidth={14} />
        <p className="text-sm text-muted-foreground mt-2">Large</p>
      </div>
    </div>
  ),
};

// Custom max value
export const CustomMax: Story = {
  render: () => (
    <div className="text-center">
      <Gauge value={750} max={1000} formatValue={(v) => `${v}/1000`} />
      <p className="text-sm text-muted-foreground mt-2">Custom max value</p>
    </div>
  ),
};

// Without value display
export const NoValueDisplay: Story = {
  args: {
    value: 60,
    showValue: false,
  },
};

// Custom format
export const CustomFormat: Story = {
  render: () => (
    <div className="flex items-end gap-8">
      <div className="text-center">
        <Gauge value={85} formatValue={(v) => `${v}%`} />
        <p className="text-sm text-muted-foreground mt-2">Percentage</p>
      </div>
      <div className="text-center">
        <Gauge value={85} formatValue={(v) => `${v}/100`} />
        <p className="text-sm text-muted-foreground mt-2">Fraction</p>
      </div>
      <div className="text-center">
        <Gauge value={85} formatValue={(v) => (v >= 80 ? 'Great!' : 'Good')} />
        <p className="text-sm text-muted-foreground mt-2">Custom text</p>
      </div>
    </div>
  ),
};

// Pass rate example
export const PassRate: Story = {
  render: () => (
    <div className="w-[200px] p-4 border rounded-lg">
      <h4 className="text-sm font-medium text-center mb-4">Test Pass Rate</h4>
      <div className="flex justify-center">
        <Gauge value={89} size={120} strokeWidth={12} />
      </div>
      <div className="text-center mt-4">
        <p className="text-sm text-muted-foreground">89 of 100 tests passed</p>
      </div>
    </div>
  ),
};

// Dashboard cards
export const DashboardCards: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-4">
      <div className="p-4 border rounded-lg">
        <h4 className="text-sm font-medium mb-2">Pass Rate</h4>
        <div className="flex justify-center">
          <Gauge value={92} size={80} strokeWidth={8} />
        </div>
      </div>
      <div className="p-4 border rounded-lg">
        <h4 className="text-sm font-medium mb-2">Coverage</h4>
        <div className="flex justify-center">
          <Gauge value={78} size={80} strokeWidth={8} />
        </div>
      </div>
      <div className="p-4 border rounded-lg">
        <h4 className="text-sm font-medium mb-2">Success</h4>
        <div className="flex justify-center">
          <Gauge value={65} size={80} strokeWidth={8} />
        </div>
      </div>
    </div>
  ),
};

// NaN value
export const NaNValue: Story = {
  args: {
    value: NaN,
  },
};
