import { CopyButton } from './copy-button';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof CopyButton> = {
  title: 'UI/CopyButton',
  component: CopyButton,
  tags: ['autodocs'],
  argTypes: {
    value: {
      control: 'text',
      description: 'The value to copy to clipboard',
    },
    iconSize: {
      control: 'text',
      description: 'Tailwind classes for icon size',
    },
  },
};

export default meta;
type Story = StoryObj<typeof CopyButton>;

// Default copy button
export const Default: Story = {
  args: {
    value: 'Text to copy',
  },
};

// Different sizes
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <div className="flex flex-col items-center gap-2">
        <CopyButton value="small" iconSize="h-3 w-3" />
        <span className="text-xs text-muted-foreground">Small</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <CopyButton value="default" />
        <span className="text-xs text-muted-foreground">Default</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <CopyButton value="large" iconSize="h-5 w-5" />
        <span className="text-xs text-muted-foreground">Large</span>
      </div>
    </div>
  ),
};

// With code block
export const WithCodeBlock: Story = {
  render: () => {
    const code = 'npx promptfoo eval -c config.yaml';
    return (
      <div className="flex items-center gap-2 rounded-md bg-muted p-3 font-mono text-sm">
        <span className="flex-1">{code}</span>
        <CopyButton value={code} />
      </div>
    );
  },
};

// With ID
export const WithID: Story = {
  render: () => {
    const id = 'abc-123-xyz-789';
    return (
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm">{id}</span>
        <CopyButton value={id} iconSize="h-3 w-3" />
      </div>
    );
  },
};

// In card
export const InCard: Story = {
  render: () => {
    const apiKey = 'sk-abc123xyz789...';
    return (
      <div className="w-[300px] rounded-lg border p-4">
        <h4 className="text-sm font-medium mb-2">API Key</h4>
        <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
          <span className="font-mono text-sm">{apiKey}</span>
          <CopyButton value="sk-abc123xyz789full-key" />
        </div>
        <p className="text-xs text-muted-foreground mt-2">Click to copy the full key</p>
      </div>
    );
  },
};

// Multiple copy buttons
export const MultipleCopyButtons: Story = {
  render: () => {
    const items = [
      { label: 'Evaluation ID', value: 'eval-2024-01-15-abc' },
      { label: 'Run ID', value: 'run-xyz-123' },
      { label: 'Config Hash', value: 'sha256:abc123def456' },
    ];

    return (
      <div className="w-[350px] space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-xs font-mono text-muted-foreground">{item.value}</p>
            </div>
            <CopyButton value={item.value} />
          </div>
        ))}
      </div>
    );
  },
};

// In table cell
export const InTableCell: Story = {
  render: () => (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b">
          <th className="text-left py-2">Name</th>
          <th className="text-left py-2">ID</th>
          <th className="py-2 w-10"></th>
        </tr>
      </thead>
      <tbody>
        {[
          { name: 'Test A', id: 'test-a-123' },
          { name: 'Test B', id: 'test-b-456' },
          { name: 'Test C', id: 'test-c-789' },
        ].map((row) => (
          <tr key={row.id} className="border-b">
            <td className="py-2">{row.name}</td>
            <td className="py-2 font-mono text-muted-foreground">{row.id}</td>
            <td className="py-2">
              <CopyButton value={row.id} iconSize="h-3 w-3" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
};
