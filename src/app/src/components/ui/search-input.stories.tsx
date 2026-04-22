import { useState } from 'react';

import { SearchInput } from './search-input';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof SearchInput> = {
  title: 'UI/SearchInput',
  component: SearchInput,
  tags: ['autodocs'],
  argTypes: {
    placeholder: {
      control: 'text',
      description: 'Placeholder text',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the input is disabled',
    },
  },
};

export default meta;
type Story = StoryObj<typeof SearchInput>;

// Default search input
export const Default: Story = {
  render: function DefaultSearchInput() {
    const [value, setValue] = useState('');
    return (
      <div className="w-[300px]">
        <SearchInput value={value} onChange={setValue} placeholder="Search..." />
      </div>
    );
  },
};

// With value
export const WithValue: Story = {
  render: function WithValueSearchInput() {
    const [value, setValue] = useState('test query');
    return (
      <div className="w-[300px]">
        <SearchInput value={value} onChange={setValue} placeholder="Search..." />
      </div>
    );
  },
};

// Custom placeholder
export const CustomPlaceholder: Story = {
  render: function CustomPlaceholderSearchInput() {
    const [value, setValue] = useState('');
    return (
      <div className="w-[300px]">
        <SearchInput value={value} onChange={setValue} placeholder="Search evaluations..." />
      </div>
    );
  },
};

// Disabled
export const Disabled: Story = {
  render: function DisabledSearchInput() {
    const [value, setValue] = useState('disabled');
    return (
      <div className="w-[300px]">
        <SearchInput value={value} onChange={setValue} disabled />
      </div>
    );
  },
};

// Full width
export const FullWidth: Story = {
  render: function FullWidthSearchInput() {
    const [value, setValue] = useState('');
    return (
      <div className="w-full">
        <SearchInput value={value} onChange={setValue} placeholder="Search across all content..." />
      </div>
    );
  },
};

// With clear callback
export const WithClearCallback: Story = {
  render: function ClearCallbackSearchInput() {
    const [value, setValue] = useState('');
    const [clearCount, setClearCount] = useState(0);

    return (
      <div className="space-y-4 w-[300px]">
        <SearchInput
          value={value}
          onChange={setValue}
          onClear={() => setClearCount((c) => c + 1)}
          placeholder="Search..."
        />
        <p className="text-sm text-muted-foreground">Clear button pressed: {clearCount} times</p>
      </div>
    );
  },
};

// In header
export const InHeader: Story = {
  render: function HeaderSearchInput() {
    const [value, setValue] = useState('');

    return (
      <div className="flex items-center justify-between p-4 border-b">
        <h1 className="text-lg font-semibold">Evaluations</h1>
        <SearchInput
          value={value}
          onChange={setValue}
          placeholder="Search evaluations..."
          containerClassName="w-[250px]"
        />
      </div>
    );
  },
};

// Filter list example
export const FilterListExample: Story = {
  render: function FilterListSearchInput() {
    const [query, setQuery] = useState('');
    const items = [
      'GPT-4 Evaluation',
      'Claude 3 Test',
      'Security Audit',
      'Performance Test',
      'API Testing',
    ];
    const filteredItems = items.filter((item) => item.toLowerCase().includes(query.toLowerCase()));

    return (
      <div className="w-[300px] space-y-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Filter items..." />
        <div className="space-y-2">
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => (
              <div key={item} className="p-2 border rounded-md text-sm">
                {item}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No items found</p>
          )}
        </div>
      </div>
    );
  },
};

// Table filter
export const TableFilter: Story = {
  render: function TableFilterSearchInput() {
    const [query, setQuery] = useState('');

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="font-medium">Test Results</h3>
            <p className="text-sm text-muted-foreground">View and filter your test results</p>
          </div>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search results..."
            containerClassName="w-[200px]"
          />
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground text-center">
            {query ? `Filtering by: "${query}"` : 'Showing all results'}
          </p>
        </div>
      </div>
    );
  },
};
