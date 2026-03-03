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

interface TaggedEvaluation {
  id: string;
  name: string;
  tags: string[];
  owner: string;
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

const longNameData: Evaluation[] = [
  {
    id: 'long-1',
    name: 'This is an intentionally very long evaluation name designed to demonstrate cell truncation behavior in a constrained DataTable layout',
    status: 'passed',
    score: 100,
    provider: 'openai',
    createdAt: '2024-01-16',
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
const printDataset = generateLargeDataset(30); // 30 rows to test print all rows (>25)
const taggedData: TaggedEvaluation[] = [
  {
    id: 'tag-1',
    name: 'Prompt Injection Guardrail',
    tags: ['prompt-injection', 'jailbreak'],
    owner: 'Safety',
  },
  {
    id: 'tag-2',
    name: 'PII Redaction Check',
    tags: ['pii', 'data-loss'],
    owner: 'Privacy',
  },
  {
    id: 'tag-3',
    name: 'Tool Call Policy Test',
    tags: ['tool-use', 'prompt-injection'],
    owner: 'Platform',
  },
  {
    id: 'tag-4',
    name: 'RAG Data Exposure Audit',
    tags: ['data-loss', 'access-control'],
    owner: 'Security',
  },
  {
    id: 'tag-5',
    name: 'Output Safety Validation',
    tags: ['toxicity', 'jailbreak'],
    owner: 'Safety',
  },
  {
    id: 'tag-6',
    name: 'Agent Permission Boundary Test',
    tags: ['access-control', 'tool-use'],
    owner: 'Platform',
  },
];
const taggedFilterOptions = [
  { label: 'Prompt Injection', value: 'prompt-injection' },
  { label: 'Jailbreak', value: 'jailbreak' },
  { label: 'PII', value: 'pii' },
  { label: 'Data Loss', value: 'data-loss' },
  { label: 'Tool Use', value: 'tool-use' },
  { label: 'Access Control', value: 'access-control' },
  { label: 'Toxicity', value: 'toxicity' },
];
const taggedColumns: ColumnDef<TaggedEvaluation>[] = [
  {
    accessorKey: 'name',
    header: 'Evaluation',
    size: 260,
  },
  {
    accessorKey: 'tags',
    header: 'Tags',
    size: 320,
    cell: ({ row }) => {
      const tags = row.getValue('tags') as string[];
      return (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <Badge key={tag} variant="outline" className="capitalize">
              {tag.replace(/-/g, ' ')}
            </Badge>
          ))}
        </div>
      );
    },
    meta: {
      filterVariant: 'select',
      filterOptions: taggedFilterOptions,
    },
    filterFn: (row, columnId, filterValue) => {
      if (!filterValue || typeof filterValue !== 'object') {
        return true;
      }

      const { operator, value } = filterValue as {
        operator?: string;
        value?: string | string[];
      };
      const selectedTags = Array.isArray(value) ? value : value ? [value] : [];
      if (selectedTags.length === 0) {
        return true;
      }

      const rowTags = row.getValue(columnId);
      if (!Array.isArray(rowTags)) {
        return false;
      }

      const normalizedRowTags = rowTags.map((tag) => String(tag).toLowerCase());
      const normalizedSelectedTags = selectedTags.map((tag) => String(tag).toLowerCase());

      if (operator === 'notEquals') {
        return normalizedSelectedTags.every((tag) => !normalizedRowTags.includes(tag));
      }

      return normalizedSelectedTags.some((tag) => normalizedRowTags.includes(tag));
    },
  },
  {
    accessorKey: 'owner',
    header: 'Owner',
    size: 120,
    meta: {
      filterVariant: 'select',
      filterOptions: [
        { label: 'Safety', value: 'Safety' },
        { label: 'Privacy', value: 'Privacy' },
        { label: 'Platform', value: 'Platform' },
        { label: 'Security', value: 'Security' },
      ],
    },
  },
];

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
        <div className="text-sm text-gray-500 dark:text-gray-400">
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
        {clicked && (
          <div className="text-sm text-gray-500 dark:text-gray-400">Last clicked: {clicked}</div>
        )}
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

// Server-side / manual pagination
export const ManualPagination: Story = {
  render: () => {
    const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 10 });
    const totalRows = largeDataset.length;
    const pageCount = Math.ceil(totalRows / pagination.pageSize);
    const pageData = largeDataset.slice(
      pagination.pageIndex * pagination.pageSize,
      (pagination.pageIndex + 1) * pagination.pageSize,
    );

    return (
      <DataTable
        columns={columns}
        data={pageData}
        manualPagination={true}
        rowCount={totalRows}
        pageCount={pageCount}
        pageIndex={pagination.pageIndex}
        pageSize={pagination.pageSize}
        onPaginationChange={setPagination}
        onPageSizeChange={(size) => setPagination({ pageIndex: 0, pageSize: size })}
      />
    );
  },
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

// Column header filters — hover over a column header to see the filter icon.
// Columns with `filterVariant: 'select'` show a dropdown, others show a text input with operators.
export const WithColumnHeaderFilters: Story = {
  render: () => <DataTable columns={columns} data={largeDataset} initialPageSize={10} />,
};

// Multi-select tag filtering with array-valued cells.
export const WithMultiTagColumnFilter: Story = {
  render: () => (
    <div className="space-y-3">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Hover the Tags header, choose "is any of", and select multiple tags to filter rows that
        include any selected tag.
      </p>
      <DataTable columns={taggedColumns} data={taggedData} showPagination={false} />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates filtering one column with multiple tags. The Tags column stores string arrays and supports multi-select filtering via the `is any of` operator.',
      },
    },
  },
};

// Demonstrates long, dense content staying within fixed column constraints.
export const WithLongCellContent: Story = {
  render: () => {
    const longContentColumns: ColumnDef<Evaluation>[] = [
      {
        accessorKey: 'id',
        header: 'ID',
        size: 120,
      },
      {
        accessorKey: 'name',
        header: 'Name',
        size: 180,
        cell: ({ row }) => (
          <span className="truncate block w-full" title={row.getValue<string>('name')}>
            {row.getValue<string>('name')}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        size: 120,
      },
    ];

    return <DataTable columns={longContentColumns} data={longNameData} />;
  },
};

// Custom column widths — demonstrates fixed pixel sizes and proportional (flex-like) sizing.
// The table uses `tableLayout: 'fixed'` with `w-full`, so when the container is wider than
// the sum of all `size` values, extra space is distributed proportionally — `size` acts like
// a flex ratio. A column with `size: 300` gets 3× the extra space of one with `size: 100`.
export const CustomColumnWidths: StoryObj<{
  idWidth: number;
  nameWidth: number;
  statusWidth: number;
  scoreWidth: number;
  providerWidth: number;
  createdAtWidth: number;
}> = {
  args: {
    idWidth: 60,
    nameWidth: 300,
    statusWidth: 100,
    scoreWidth: 80,
    providerWidth: 150,
    createdAtWidth: 120,
  },
  argTypes: {
    idWidth: { control: { type: 'range', min: 40, max: 400, step: 10 }, name: 'ID width (px)' },
    nameWidth: {
      control: { type: 'range', min: 40, max: 400, step: 10 },
      name: 'Name width (px)',
    },
    statusWidth: {
      control: { type: 'range', min: 40, max: 400, step: 10 },
      name: 'Status width (px)',
    },
    scoreWidth: {
      control: { type: 'range', min: 40, max: 400, step: 10 },
      name: 'Score width (px)',
    },
    providerWidth: {
      control: { type: 'range', min: 40, max: 400, step: 10 },
      name: 'Provider width (px)',
    },
    createdAtWidth: {
      control: { type: 'range', min: 40, max: 400, step: 10 },
      name: 'Created At width (px)',
    },
  },
  render: (args) => {
    const customColumns: ColumnDef<Evaluation>[] = [
      {
        accessorKey: 'id',
        header: 'ID',
        size: args.idWidth,
      },
      {
        accessorKey: 'name',
        header: 'Name',
        size: args.nameWidth,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        size: args.statusWidth,
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
      },
      {
        accessorKey: 'score',
        header: 'Score',
        size: args.scoreWidth,
        cell: ({ row }) => {
          const score = row.getValue('score') as number;
          return <span className="font-mono tabular-nums">{score}%</span>;
        },
        meta: { align: 'right' },
      },
      {
        accessorKey: 'provider',
        header: 'Provider',
        size: args.providerWidth,
      },
      {
        accessorKey: 'createdAt',
        header: 'Created At',
        size: args.createdAtWidth,
      },
    ];

    return <DataTable columns={customColumns} data={sampleData} />;
  },
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
// When printed, the table will appear in light mode with all rows visible
export const PrintStyles: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="dark bg-gray-950 p-6 rounded-lg">
        <p className="text-sm text-gray-400 mb-4">
          This table has 30 rows to test the "print all rows" functionality. Use your browser's
          print preview (Cmd/Ctrl + P) to see how it renders in light mode for printing. All rows
          should be visible in print, bypassing pagination.
        </p>
        <DataTable columns={columns} data={printDataset} initialPageSize={10} />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The DataTable includes print-specific styles that force light mode colors and show all rows when printing, ensuring readability regardless of the current theme or pagination settings.',
      },
    },
  },
};

// Row expansion - basic
export const WithRowExpansion: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={sampleData}
      renderSubComponent={(row) => (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Details for {row.original.name}</h4>
          <p className="text-sm text-muted-foreground">
            Provider: {row.original.provider} | Score: {row.original.score}% | Created:{' '}
            {row.original.createdAt}
          </p>
        </div>
      )}
    />
  ),
};

// Row expansion - accordion (single expand)
export const WithSingleExpand: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={sampleData}
      singleExpand
      renderSubComponent={(row) => (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Details for {row.original.name}</h4>
          <p className="text-sm text-muted-foreground">
            Only one row can be expanded at a time (accordion mode).
          </p>
        </div>
      )}
    />
  ),
};

// Row expansion with row selection
export const WithExpansionAndSelection: Story = {
  render: () => {
    const [selection, setSelection] = React.useState<Record<string, boolean>>({});

    return (
      <DataTable
        columns={columns}
        data={sampleData}
        enableRowSelection
        rowSelection={selection}
        onRowSelectionChange={setSelection}
        getRowId={(row) => row.id}
        renderSubComponent={(row) => (
          <div className="text-sm text-muted-foreground">
            Expanded detail for {row.original.name}
          </div>
        )}
      />
    );
  },
};

// Row expansion with getRowCanExpand predicate
export const WithConditionalExpansion: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={sampleData}
      getRowCanExpand={(row) => row.original.status !== 'pending'}
      renderSubComponent={(row) => (
        <div className="text-sm text-muted-foreground">
          Details for {row.original.name} (only non-pending rows are expandable)
        </div>
      )}
    />
  ),
};

// Explicit Tailwind utility colors (light and dark variants) are preserved in cell renderers.
export const WithExplicitTailwindColors: Story = {
  render: () => {
    const colorColumns: ColumnDef<Evaluation>[] = [
      {
        accessorKey: 'name',
        header: 'Name',
        size: 260,
        cell: ({ getValue }) => (
          <span className="text-sky-700 dark:text-sky-300 bg-amber-100 dark:bg-amber-950 px-2 py-0.5 rounded">
            {getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        size: 140,
      },
      {
        accessorKey: 'score',
        header: 'Score',
        size: 100,
      },
    ];

    return (
      <div className="space-y-6">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">Light mode</p>
          <DataTable columns={colorColumns} data={sampleData.slice(0, 3)} showPagination={false} />
        </div>
        <div className="rounded-lg border p-4 dark bg-zinc-950">
          <p className="text-sm text-zinc-300 mb-3">Dark mode</p>
          <div className="dark">
            <DataTable
              columns={colorColumns}
              data={sampleData.slice(0, 3)}
              showPagination={false}
            />
          </div>
        </div>
      </div>
    );
  },
};
