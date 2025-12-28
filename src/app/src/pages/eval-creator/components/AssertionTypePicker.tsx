/**
 * AssertionTypePicker
 *
 * Searchable picker for selecting assertion types.
 * Uses the assertion registry as the single source of truth.
 */

import { useMemo, useState } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Input } from '@app/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@app/components/ui/popover';
import { cn } from '@app/lib/utils';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { AssertionType } from '@promptfoo/types';
import {
  ASSERTION_REGISTRY,
  getPrimaryTag,
  TAG_META,
  type AssertionTag,
  type AssertionTypeDefinition,
} from '@app/utils/assertionRegistry';

// Re-export from registry for convenience
export { requiresLlm, getAssertionType } from '@app/utils/assertionRegistry';

/**
 * Get assertion types organized by primary tag for the picker UI.
 * Derives all data from the registry - no duplication.
 */
function getAssertionsByPrimaryTag(): Map<AssertionTag, AssertionTypeDefinition[]> {
  const byTag = new Map<AssertionTag, AssertionTypeDefinition[]>();

  for (const def of Object.values(ASSERTION_REGISTRY)) {
    const primaryTag = getPrimaryTag(def.tags);
    const list = byTag.get(primaryTag) || [];
    list.push(def);
    byTag.set(primaryTag, list);
  }

  return byTag;
}

/**
 * Tag display order for consistent UI
 */
const TAG_ORDER: AssertionTag[] = [
  'ai-evaluation',
  'text-matching',
  'similarity',
  'format',
  'safety',
  'performance',
  'custom',
  'negation',
];

interface AssertionTypePickerProps {
  value: string;
  onValueChange: (value: AssertionType) => void;
  id?: string;
}

export function AssertionTypePicker({ value, onValueChange, id }: AssertionTypePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Get all types organized by primary tag from the registry
  const assertionsByTag = useMemo(() => getAssertionsByPrimaryTag(), []);

  // Filter tags and types based on search
  const filteredTags = useMemo(() => {
    const result = new Map<AssertionTag, AssertionTypeDefinition[]>();

    for (const tag of TAG_ORDER) {
      const types = assertionsByTag.get(tag) || [];

      if (!search.trim()) {
        if (types.length > 0) {
          result.set(tag, types);
        }
        continue;
      }

      const searchLower = search.toLowerCase();
      const tagLabel = TAG_META[tag]?.label || tag;

      const matchingTypes = types.filter(
        (def) =>
          def.id.toLowerCase().includes(searchLower) ||
          def.label.toLowerCase().includes(searchLower) ||
          def.description.toLowerCase().includes(searchLower) ||
          tagLabel.toLowerCase().includes(searchLower) ||
          // Also search in all tags (not just primary)
          def.tags.some((t) => TAG_META[t]?.label.toLowerCase().includes(searchLower)),
      );

      if (matchingTypes.length > 0) {
        result.set(tag, matchingTypes);
      }
    }

    return result;
  }, [search, assertionsByTag]);

  // Get info for the currently selected value
  const selectedDef = ASSERTION_REGISTRY[value];
  const hasResults = filteredTags.size > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="flex items-center gap-2 truncate">
            {selectedDef ? (
              <>
                <span>{selectedDef.id}</span>
                {selectedDef.requiresLlm && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0">
                    LLM
                  </Badge>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">Select assertion type...</span>
            )}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <div className="flex items-center border-b border-border px-3 py-2">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            placeholder="Search assertion types..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <div className="max-h-[350px] overflow-y-auto">
          {hasResults ? (
            <div className="p-2">
              {Array.from(filteredTags.entries()).map(([tag, types]) => (
                <div key={tag} className="mb-4 last:mb-0">
                  <div className="mb-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {TAG_META[tag]?.label || tag}
                  </div>
                  <div className="space-y-1">
                    {types.map((def) => (
                      <button
                        key={def.id}
                        type="button"
                        onClick={() => {
                          onValueChange(def.id);
                          setOpen(false);
                          setSearch('');
                        }}
                        className={cn(
                          'w-full flex items-start gap-2 rounded-md px-2 py-2 text-left text-sm',
                          'hover:bg-muted/50 transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          value === def.id && 'bg-muted',
                        )}
                      >
                        <Check
                          className={cn(
                            'mt-0.5 h-4 w-4 shrink-0',
                            value === def.id ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{def.id}</span>
                            {def.requiresLlm && (
                              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                LLM
                              </Badge>
                            )}
                            {/* Show cross-cutting tags as badges */}
                            {def.tags
                              .filter(
                                (t) => t !== getPrimaryTag(def.tags) && ['rag', 'embeddings', 'external'].includes(t),
                              )
                              .map((t) => (
                                <Badge key={t} variant="outline" className="text-[10px] px-1 py-0">
                                  {TAG_META[t]?.label || t}
                                </Badge>
                              ))}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No assertion types found for "{search}"
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default AssertionTypePicker;
