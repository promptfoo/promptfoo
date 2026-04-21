import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import type { EvalResultsFilterMode } from '@promptfoo/types';

interface FilterModeSelectorProps {
  filterMode: EvalResultsFilterMode;
  onChange: (value: EvalResultsFilterMode) => void;
  showDifferentOption?: boolean;
}

const BASE_OPTIONS: { value: EvalResultsFilterMode; label: string; tooltip: string }[] = [
  { value: 'all', label: 'All results', tooltip: 'Show all test results' },
  { value: 'failures', label: 'Failures only', tooltip: 'Show only tests that failed assertions' },
  { value: 'passes', label: 'Passes only', tooltip: 'Show only tests that passed all assertions' },
  { value: 'errors', label: 'Errors only', tooltip: 'Show only tests that encountered errors' },
  {
    value: 'different',
    label: 'Different outputs',
    tooltip: 'Show only tests with different outputs across providers',
  },
  { value: 'highlights', label: 'Highlights only', tooltip: 'Show only highlighted results' },
  {
    value: 'user-rated',
    label: 'User-rated only',
    tooltip: 'Show only results with manual user ratings (thumbs up/down)',
  },
];

const TOGGLE_LABELS: Record<EvalResultsFilterMode, string> = {
  all: 'All',
  failures: 'Failures',
  passes: 'Passes',
  errors: 'Errors',
  different: 'Different',
  highlights: 'Highlights',
  'user-rated': 'User-rated',
};

export const FilterModeSelector = ({
  filterMode,
  onChange,
  showDifferentOption = true,
}: FilterModeSelectorProps) => {
  const options = showDifferentOption
    ? BASE_OPTIONS
    : BASE_OPTIONS.filter((o) => o.value !== 'different');

  return (
    <>
      {/* Mobile: dropdown */}
      <div className="md:hidden">
        <Select value={filterMode} onValueChange={onChange}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="All results" />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop: toggle chips */}
      <div className="hidden md:flex items-center gap-1.5">
        {options.map((option) => (
          <Tooltip key={option.value} disableHoverableContent>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onChange(option.value)}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-150 border cursor-pointer',
                  filterMode === option.value
                    ? 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20'
                    : 'bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground',
                )}
              >
                {TOGGLE_LABELS[option.value]}
              </button>
            </TooltipTrigger>
            <TooltipContent>{option.tooltip}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </>
  );
};
