import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import type { EvalResultsFilterMode } from '@promptfoo/types';

interface FilterModeSelectorProps {
  filterMode: EvalResultsFilterMode;
  onChange: (value: EvalResultsFilterMode) => void;
  showDifferentOption?: boolean;
}

const BASE_OPTIONS: { value: EvalResultsFilterMode; label: string }[] = [
  { value: 'all', label: 'All results' },
  { value: 'failures', label: 'Failures only' },
  { value: 'passes', label: 'Passes only' },
  { value: 'errors', label: 'Errors only' },
  { value: 'different', label: 'Different outputs' },
  { value: 'highlights', label: 'Highlights only' },
  { value: 'user-rated', label: 'User-rated only' },
];

export const FilterModeSelector = ({
  filterMode,
  onChange,
  showDifferentOption = true,
}: FilterModeSelectorProps) => {
  const options = showDifferentOption
    ? BASE_OPTIONS
    : BASE_OPTIONS.filter((o) => o.value !== 'different');

  return (
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
  );
};
