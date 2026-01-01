import { useState } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Input } from '@app/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@app/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@app/components/ui/tabs';
import { cn } from '@app/lib/utils';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Check,
  ChevronDown,
  FileIcon,
  ImageIcon,
  LayoutGrid,
  Music,
  Search,
  Video,
  X,
} from 'lucide-react';

import type { EvalOption, MediaSort, MediaTypeFilter } from '../types';

interface MediaFiltersProps {
  typeFilter: MediaTypeFilter;
  onTypeFilterChange: (type: MediaTypeFilter) => void;
  evalFilter: string;
  onEvalFilterChange: (evalId: string) => void;
  sort: MediaSort;
  onSortChange: (sort: MediaSort) => void;
  evals: EvalOption[];
  total: number;
}

const typeOptions: { value: MediaTypeFilter; label: string; icon: typeof ImageIcon }[] = [
  { value: 'all', label: 'All', icon: LayoutGrid },
  { value: 'image', label: 'Images', icon: ImageIcon },
  { value: 'video', label: 'Videos', icon: Video },
  { value: 'audio', label: 'Audio', icon: Music },
  { value: 'other', label: 'Other', icon: FileIcon },
];

const sortOptions = [
  { value: 'createdAt:desc', label: 'Newest first', field: 'createdAt', order: 'desc' },
  { value: 'createdAt:asc', label: 'Oldest first', field: 'createdAt', order: 'asc' },
  { value: 'sizeBytes:desc', label: 'Largest first', field: 'sizeBytes', order: 'desc' },
  { value: 'sizeBytes:asc', label: 'Smallest first', field: 'sizeBytes', order: 'asc' },
] as const;

export function MediaFilters({
  typeFilter,
  onTypeFilterChange,
  evalFilter,
  onEvalFilterChange,
  sort,
  onSortChange,
  evals,
  total,
}: MediaFiltersProps) {
  const [evalSearchOpen, setEvalSearchOpen] = useState(false);
  const [evalSearchQuery, setEvalSearchQuery] = useState('');
  const currentSortValue = `${sort.field}:${sort.order}`;

  // Filter evals based on search query
  const filteredEvals = evals.filter(
    (e) =>
      e.evalId &&
      (evalSearchQuery === '' ||
        e.description?.toLowerCase().includes(evalSearchQuery.toLowerCase()) ||
        e.evalId.toLowerCase().includes(evalSearchQuery.toLowerCase())),
  );

  // Find selected eval for display
  const selectedEval = evals.find((e) => e.evalId === evalFilter);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        {/* Type Filter Tabs */}
        <Tabs value={typeFilter} onValueChange={(v) => onTypeFilterChange(v as MediaTypeFilter)}>
          <TabsList className="h-9">
            {typeOptions.map((option) => (
              <TabsTrigger
                key={option.value}
                value={option.value}
                className="gap-1.5 text-xs sm:text-sm"
              >
                <option.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{option.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Badge variant="secondary" className="font-mono text-xs">
          {total} items
        </Badge>
      </div>

      <div className="flex items-center gap-2">
        {/* Sort Dropdown */}
        <Select
          value={currentSortValue}
          onValueChange={(v) => {
            const option = sortOptions.find((o) => o.value === v);
            if (option) {
              onSortChange({ field: option.field, order: option.order });
            }
          }}
        >
          <SelectTrigger className="w-[160px] h-9">
            <div className="flex items-center gap-1.5">
              {sort.order === 'desc' ? (
                <ArrowDownAZ className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ArrowUpAZ className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Eval Filter with Search */}
        <Popover open={evalSearchOpen} onOpenChange={setEvalSearchOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={evalSearchOpen}
              className={cn(
                'w-[160px] sm:w-[220px] h-9 justify-between font-normal bg-white dark:bg-zinc-900',
                !evalFilter && 'text-muted-foreground',
              )}
            >
              <span className="truncate text-sm">
                {selectedEval ? selectedEval.description : 'All Evaluations'}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] sm:w-[320px] p-0" align="start">
            <div className="flex items-center border-b px-3 py-2">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <Input
                placeholder="Search evaluations..."
                value={evalSearchQuery}
                onChange={(e) => setEvalSearchQuery(e.target.value)}
                className="h-8 border-0 p-0 shadow-none focus-visible:ring-0"
              />
              {evalSearchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setEvalSearchQuery('')}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <div className="max-h-[300px] overflow-y-auto p-1">
              {/* All Evaluations option */}
              <button
                type="button"
                className={cn(
                  'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none',
                  'hover:bg-accent hover:text-accent-foreground',
                  !evalFilter && 'bg-accent',
                )}
                onClick={() => {
                  onEvalFilterChange('');
                  setEvalSearchOpen(false);
                  setEvalSearchQuery('');
                }}
              >
                <Check className={cn('mr-2 h-4 w-4', evalFilter ? 'opacity-0' : 'opacity-100')} />
                <span>All Evaluations</span>
              </button>

              {/* Filtered eval options */}
              {filteredEvals.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No evaluations found
                </div>
              ) : (
                filteredEvals.map((e) => (
                  <button
                    key={e.evalId}
                    type="button"
                    className={cn(
                      'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none',
                      'hover:bg-accent hover:text-accent-foreground',
                      evalFilter === e.evalId && 'bg-accent',
                    )}
                    onClick={() => {
                      onEvalFilterChange(e.evalId);
                      setEvalSearchOpen(false);
                      setEvalSearchQuery('');
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4 shrink-0',
                        evalFilter === e.evalId ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="truncate">{e.description}</span>
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
