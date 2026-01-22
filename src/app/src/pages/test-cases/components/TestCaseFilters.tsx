import { Input } from '@app/components/ui/input';
import { Search } from 'lucide-react';

interface TestCaseFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

/**
 * Filter controls for the test cases list.
 * Provides search functionality for filtering test cases by variable content.
 */
export function TestCaseFilters({ searchQuery, onSearchChange }: TestCaseFiltersProps) {
  return (
    <div className="flex items-center gap-4">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search test cases..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>
    </div>
  );
}
