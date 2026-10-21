import React from 'react';

import { Badge } from '@app/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@app/components/ui/breadcrumb';
import { Button } from '@app/components/ui/button';
import { Chip } from '@app/components/ui/chip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@app/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@app/components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@app/components/ui/tabs';
import { EVAL_ROUTES } from '@app/constants/routes';
import { useToast } from '@app/hooks/useToast';
import { cn } from '@app/lib/utils';
import { fetchUserEmail, updateEvalAuthor } from '@app/utils/api';
import { formatDuration } from '@app/utils/date';
import { ChevronDown, Ellipsis } from 'lucide-react';
import { Link } from 'react-router';
import { AuthorChip } from './AuthorChip';
import { EvalIdChip } from './EvalIdChip';
import EvalSelectorDialog from './EvalSelectorDialog';
import EvalSelectorKeyboardShortcut from './EvalSelectorKeyboardShortcut';
import { useTableStore } from './store';
import type { ResultLightweightWithLabel } from '@promptfoo/types';

export type ActiveView = 'results' | 'report';

interface EvalHeaderProps {
  recentEvals: ResultLightweightWithLabel[];
  onRecentEvalSelected: (evalId: string) => void;
  defaultEvalId?: string;
  activeView: ActiveView;
  onActiveViewChange: (view: ActiveView) => void;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  /** Constrain header content width (e.g. "max-w-7xl mx-auto" for report view) */
  contentClassName?: string;
}

export default function EvalHeader({
  recentEvals,
  onRecentEvalSelected,
  defaultEvalId,
  activeView,
  onActiveViewChange,
  actions,
  children,
  contentClassName,
}: EvalHeaderProps) {
  const { showToast } = useToast();

  const { evalId, author, config, totalResultsCount, stats, table, setAuthor } = useTableStore();

  const { head } = table!;

  const [evalSelectorDialogOpen, setEvalSelectorDialogOpen] = React.useState(false);
  const [evalActionsOpen, setEvalActionsOpen] = React.useState(false);
  const [currentUserEmail, setCurrentUserEmail] = React.useState<string | null>(null);
  const evalDetailsRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    fetchUserEmail().then((email) => {
      setCurrentUserEmail(email);
    });
  }, []);

  const isRedteam = config?.redteam !== undefined || config?.metadata?.redteam !== undefined;
  const validEvalId = evalId || defaultEvalId;

  const currentEvalData = React.useMemo(
    () => recentEvals.find((e) => e.evalId === evalId),
    [recentEvals, evalId],
  );

  const formattedDate = React.useMemo(() => {
    if (!currentEvalData?.createdAt) {
      return null;
    }
    return new Date(currentEvalData.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, [currentEvalData?.createdAt]);

  const uniqueProviderCount = React.useMemo(
    () => new Set(head.prompts.map((p) => p.provider)).size,
    [head.prompts],
  );

  const probesCount = React.useMemo(() => {
    return head.prompts[0]?.metrics?.tokenUsage?.numRequests || totalResultsCount;
  }, [head.prompts, totalResultsCount]);

  const handleEvalIdCopyClick = () => {
    if (evalId) {
      navigator.clipboard.writeText(evalId).then(
        () => {
          showToast('Eval ID copied to clipboard', 'success');
        },
        () => {
          showToast('Failed to copy Eval ID to clipboard', 'error');
          console.error('Failed to copy to clipboard');
        },
      );
    }
  };

  const handleEditAuthor = async (newAuthor: string) => {
    if (evalId) {
      try {
        await updateEvalAuthor(evalId, newAuthor);
        setAuthor(newAuthor);
      } catch (error) {
        console.error('Failed to update author:', error);
        throw error;
      }
    }
  };

  return (
    <>
      <div className="border-b border-border bg-card shrink-0 print:bg-transparent print:border-none">
        <div className={cn('px-4 py-4 sm:px-6 print:px-0 print:max-w-none', contentClassName)}>
          <div className="flex flex-wrap items-center gap-3 eval-header print:hidden">
            <Breadcrumb className="min-w-0 flex-1">
              <BreadcrumbList className="flex-nowrap">
                <BreadcrumbItem className="shrink-0">
                  <BreadcrumbLink asChild>
                    <Link to={EVAL_ROUTES.LIST}>Evals</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="shrink-0" />
                <BreadcrumbItem className="min-w-0">
                  <button
                    type="button"
                    aria-current="page"
                    aria-haspopup="dialog"
                    aria-expanded={evalSelectorDialogOpen}
                    onClick={() => setEvalSelectorDialogOpen(true)}
                    title={config?.description || evalId || 'Select eval'}
                    className="inline-flex min-w-0 items-center gap-1 rounded-sm text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="truncate">
                      {config?.description || evalId || 'Select eval'}
                    </span>
                    <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                  </button>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <EvalSelectorDialog
              open={evalSelectorDialogOpen}
              onClose={() => setEvalSelectorDialogOpen(false)}
              onEvalSelected={(selectedEvalId) => {
                setEvalSelectorDialogOpen(false);
                onRecentEvalSelected(selectedEvalId);
              }}
              focusedEvalId={evalId ?? undefined}
            />
            <div className="flex flex-wrap gap-2 items-center ml-auto">
              {actions && (
                <DropdownMenu open={evalActionsOpen} onOpenChange={setEvalActionsOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      Eval actions
                      <ChevronDown className="size-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">{actions}</DropdownMenuContent>
                </DropdownMenu>
              )}
              {isRedteam && validEvalId && (
                <Tabs value={activeView} onValueChange={(v) => onActiveViewChange(v as ActiveView)}>
                  <TabsList>
                    <TabsTrigger value="results">Results</TabsTrigger>
                    <TabsTrigger value="report">Vulnerability Report</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            </div>
          </div>
          <h1 className="hidden print:block text-2xl font-bold">
            {config?.description || evalId || 'Evaluation'}
          </h1>
          <div className="mt-2 flex min-w-0 flex-nowrap items-center gap-3 print:hidden">
            {formattedDate && (
              <Chip label="DATE" interactive={false} className="shrink-0">
                {formattedDate}
              </Chip>
            )}
            <Chip
              label="AUTHOR"
              interactive={false}
              className="hidden min-w-0 max-w-64 md:inline-flex"
            >
              {author || 'Unknown'}
            </Chip>
            {stats?.durationMs != null && (
              <Chip label="DURATION" interactive={false} className="hidden shrink-0 sm:inline-flex">
                {formatDuration(stats.durationMs)}
              </Chip>
            )}
            <Chip label="PROVIDERS" interactive={false} className="hidden shrink-0 sm:inline-flex">
              {uniqueProviderCount}
            </Chip>
            <Chip label="TESTS" interactive={false} className="shrink-0">
              {totalResultsCount}
            </Chip>
            {evalId && (
              <div className="hidden min-w-0 lg:block">
                <EvalIdChip evalId={evalId} onCopy={handleEvalIdCopyClick} />
              </div>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label="More evaluation details"
                  title="More evaluation details"
                >
                  <Ellipsis className="size-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                ref={evalDetailsRef}
                align="end"
                aria-label="Evaluation details"
                onOpenAutoFocus={(event) => {
                  event.preventDefault();
                  evalDetailsRef.current?.focus();
                }}
                className="w-96 max-w-[calc(100vw-2rem)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto print:hidden"
              >
                <h2 className="mb-2 text-sm font-semibold">Evaluation details</h2>
                <div className="flex flex-col items-start gap-1">
                  {formattedDate && (
                    <Chip label="DATE" interactive={false}>
                      {formattedDate}
                    </Chip>
                  )}
                  <AuthorChip
                    author={author}
                    onEditAuthor={handleEditAuthor}
                    currentUserEmail={currentUserEmail}
                    editable
                  />
                  {stats?.durationMs != null && (
                    <Chip label="DURATION" interactive={false}>
                      {formatDuration(stats.durationMs)}
                    </Chip>
                  )}
                  <Chip label="PROVIDERS" interactive={false}>
                    {uniqueProviderCount}
                  </Chip>
                  <Chip label="TESTS" interactive={false}>
                    {totalResultsCount}
                  </Chip>
                  {isRedteam && (
                    <Chip label="PROBES" interactive={false}>
                      {probesCount}
                    </Chip>
                  )}
                  {Object.keys(config?.tags || {}).map((tag) => (
                    <Badge key={tag} variant="secondary" className="whitespace-normal break-all">
                      {`${tag}: ${config?.tags?.[tag]}`}
                    </Badge>
                  ))}
                  {evalId && <EvalIdChip evalId={evalId} onCopy={handleEvalIdCopyClick} />}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          {/* Print: clean property grid */}
          <div className="hidden print:block mt-2">
            <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-sm">
              {formattedDate && (
                <div>
                  <span className="font-semibold text-gray-700">Date:</span>{' '}
                  <span>{formattedDate}</span>
                </div>
              )}
              {author && (
                <div>
                  <span className="font-semibold text-gray-700">Author:</span> <span>{author}</span>
                </div>
              )}
              {stats?.durationMs != null && (
                <div>
                  <span className="font-semibold text-gray-700">Duration:</span>{' '}
                  <span>{formatDuration(stats.durationMs)}</span>
                </div>
              )}
              <div>
                <span className="font-semibold text-gray-700">Providers:</span>{' '}
                <span>{uniqueProviderCount}</span>
              </div>
              <div>
                <span className="font-semibold text-gray-700">Tests:</span>{' '}
                <span>{totalResultsCount}</span>
              </div>
              {isRedteam && (
                <div>
                  <span className="font-semibold text-gray-700">Probes:</span>{' '}
                  <span>{probesCount}</span>
                </div>
              )}
              {Object.keys(config?.tags || {}).map((tag) => (
                <div key={tag}>
                  <span className="font-semibold text-gray-700">{tag}:</span>{' '}
                  <span>{config?.tags?.[tag]}</span>
                </div>
              ))}
              {evalId && (
                <div>
                  <span className="font-semibold text-gray-700">Eval ID:</span>{' '}
                  <span>{evalId}</span>
                </div>
              )}
            </div>
          </div>
          {children}
        </div>
      </div>
      <EvalSelectorKeyboardShortcut onEvalSelected={onRecentEvalSelected} />
    </>
  );
}
