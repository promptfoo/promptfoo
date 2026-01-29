import * as React from 'react';

import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Download, Plus, Trash2 } from 'lucide-react';
import { DataTable } from './data-table';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ColumnDef } from '@tanstack/react-table';

// Sample data type
interface Evaluation {
  id: string;
  name: string;
  status: 'passed' | 'failed' | 'pending';
  score: number;
  provider: string;
  createdAt: string;
}

// Sample data
const sampleData: Evaluation[] = [
  {
    id: '1',
    name: 'GPT-4 Evaluation',
    status: 'passed',
    score: 95,
    provider: 'openai',
    createdAt: '2024-01-15',
  },
  {
    id: '2',
    name: 'Claude Evaluation',
    status: 'passed',
    score: 92,
    provider: 'anthropic',
    createdAt: '2024-01-14',
  },
  {
    id: '3',
    name: 'Gemini Test',
    status: 'failed',
    score: 45,
    provider: 'google',
    createdAt: '2024-01-13',
  },
  {
    id: '4',
    name: 'Llama Benchmark',
    status: 'pending',
    score: 0,
    provider: 'meta',
    createdAt: '2024-01-12',
  },
  {
    id: '5',
    name: 'Mistral Analysis',
    status: 'passed',
    score: 88,
    provider: 'mistral',
    createdAt: '2024-01-11',
  },
];

// Generate more data for pagination demo
const generateLargeDataset = (count: number): Evaluation[] => {
  const statuses: Array<'passed' | 'failed' | 'pending'> = ['passed', 'failed', 'pending'];
  const providers = ['openai', 'anthropic', 'google', 'meta', 'mistral'];
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    name: `Evaluation ${i + 1}`,
    status: statuses[i % 3],
    score: Math.floor(Math.random() * 100),
    provider: providers[i % providers.length],
    createdAt: new Date(2024, 0, 15 - (i % 30)).toISOString().split('T')[0],
  }));
};

const largeDataset = generateLargeDataset(100);

// Column definitions
const columns: ColumnDef<Evaluation>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    size: 200,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    size: 120,
    cell: ({ row }) => {
      const status = row.getValue('status') as string;
      const variant =
        status === 'passed' ? 'success' : status === 'failed' ? 'destructive' : 'secondary';
      return (
        <Badge variant={variant} truncate>
          {status}
        </Badge>
      );
    },
    meta: {
      filterVariant: 'select',
      filterOptions: [
        { label: 'Passed', value: 'passed' },
        { label: 'Failed', value: 'failed' },
        { label: 'Pending', value: 'pending' },
      ],
    },
  },
  {
    accessorKey: 'score',
    header: 'Score',
    size: 100,
    cell: ({ row }) => {
      const score = row.getValue('score') as number;
      return <span className="font-mono tabular-nums">{score}%</span>;
    },
    meta: {
      align: 'right',
    },
  },
  {
    accessorKey: 'provider',
    header: 'Provider',
    size: 120,
    meta: {
      filterVariant: 'select',
      filterOptions: [
        { label: 'OpenAI', value: 'openai' },
        { label: 'Anthropic', value: 'anthropic' },
        { label: 'Google', value: 'google' },
        { label: 'Meta', value: 'meta' },
        { label: 'Mistral', value: 'mistral' },
      ],
    },
  },
  {
    accessorKey: 'createdAt',
    header: 'Created At',
    size: 120,
  },
];

const meta: Meta<typeof DataTable<Evaluation>> = {
  title: 'Components/DataTable',
  component: DataTable,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof DataTable<Evaluation>>;

// Default table with data
export const Default: Story = {
  render: () => <DataTable columns={columns} data={sampleData} />,
};

// Loading state (basic)
export const Loading: Story = {
  render: () => <DataTable columns={columns} data={[]} isLoading={true} />,
};

// Loading state with toolbar actions
export const LoadingWithActions: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={[]}
      isLoading={true}
      toolbarActions={
        <Button size="sm">
          <Plus className="size-4 mr-2" />
          New Evaluation
        </Button>
      }
    />
  ),
};

// Error state (basic)
export const Error: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={[]}
      error="Failed to fetch evaluations. Please check your connection and try again."
    />
  ),
};

// Error state with toolbar actions
export const ErrorWithActions: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={[]}
      error="Failed to fetch evaluations. Please check your connection and try again."
      toolbarActions={
        <Button size="sm">
          <Plus className="size-4 mr-2" />
          New Evaluation
        </Button>
      }
    />
  ),
};

// Empty state (basic)
export const Empty: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={[]}
      emptyMessage="No evaluations found. Create your first evaluation to get started."
    />
  ),
};

// Empty state with toolbar actions
export const EmptyWithActions: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={[]}
      emptyMessage="No evaluations found. Create your first evaluation to get started."
      toolbarActions={
        <Button size="sm">
          <Plus className="size-4 mr-2" />
          New Evaluation
        </Button>
      }
    />
  ),
};

// With row selection
export const WithRowSelection: Story = {
  render: () => {
    const [selection, setSelection] = React.useState<Record<string, boolean>>({});

    return (
      <div className="space-y-4">
        <DataTable
          columns={columns}
          data={sampleData}
          enableRowSelection={true}
          rowSelection={selection}
          onRowSelectionChange={setSelection}
          getRowId={(row) => row.id}
        />
        <div className="text-sm text-muted-foreground">
          Selected: {Object.keys(selection).filter((k) => selection[k]).length} rows
        </div>
      </div>
    );
  },
};

// With row click handler
export const WithRowClick: Story = {
  render: () => {
    const [clicked, setClicked] = React.useState<string | null>(null);

    return (
      <div className="space-y-4">
        <DataTable columns={columns} data={sampleData} onRowClick={(row) => setClicked(row.name)} />
        {clicked && <div className="text-sm text-muted-foreground">Last clicked: {clicked}</div>}
      </div>
    );
  },
};

// With initial sorting
export const WithSorting: Story = {
  render: () => (
    <DataTable columns={columns} data={sampleData} initialSorting={[{ id: 'score', desc: true }]} />
  ),
};

// Without toolbar
export const WithoutToolbar: Story = {
  render: () => <DataTable columns={columns} data={sampleData} showToolbar={false} />,
};

// Minimal - no toolbar, no pagination
export const Minimal: Story = {
  render: () => (
    <DataTable columns={columns} data={sampleData} showToolbar={false} showPagination={false} />
  ),
};

// With custom toolbar actions
export const WithToolbarActions: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={sampleData}
      toolbarActions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline">
            <Download className="size-4 mr-2" />
            Export
          </Button>
          <Button size="sm">
            <Plus className="size-4 mr-2" />
            New Evaluation
          </Button>
        </div>
      }
    />
  ),
};

// With row selection and toolbar actions
export const SelectionWithActions: Story = {
  render: () => {
    const [selection, setSelection] = React.useState<Record<string, boolean>>({});
    const selectedCount = Object.keys(selection).filter((k) => selection[k]).length;

    return (
      <DataTable
        columns={columns}
        data={sampleData}
        enableRowSelection={true}
        rowSelection={selection}
        onRowSelectionChange={setSelection}
        getRowId={(row) => row.id}
        toolbarActions={
          selectedCount > 0 ? (
            <Button size="sm" variant="destructive">
              <Trash2 className="size-4 mr-2" />
              Delete ({selectedCount})
            </Button>
          ) : null
        }
      />
    );
  },
};

// Large dataset with pagination
export const WithPagination: Story = {
  render: () => <DataTable columns={columns} data={largeDataset} initialPageSize={10} />,
};

// With max height (scrollable)
export const WithMaxHeight: Story = {
  render: () => (
    <DataTable columns={columns} data={largeDataset} maxHeight="400px" showPagination={false} />
  ),
};

// With hidden columns
export const WithHiddenColumns: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={sampleData}
      initialColumnVisibility={{ provider: false, createdAt: false }}
    />
  ),
};

// Export handlers demo
export const WithExportHandlers: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={sampleData}
      onExportCSV={() => alert('Exporting CSV...')}
      onExportJSON={() => alert('Exporting JSON...')}
    />
  ),
};

// Customized toolbar options
export const CustomToolbarOptions: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={sampleData}
      showColumnToggle={false}
      showFilter={false}
      showExport={false}
    />
  ),
};

// Print styles demo - shows table in dark mode context
// When printed, the table will appear in light mode
export const PrintStyles: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="dark bg-zinc-950 p-6 rounded-lg">
        <p className="text-sm text-zinc-400 mb-4">
          This table is displayed in dark mode. Use your browser's print preview (Cmd/Ctrl + P) to
          see how it renders in light mode for printing.
        </p>
        <DataTable columns={columns} data={sampleData} />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The DataTable includes print-specific styles that force light mode colors when printing, ensuring readability regardless of the current theme.',
      },
    },
  },
};
