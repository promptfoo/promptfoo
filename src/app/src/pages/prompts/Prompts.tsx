import { useEffect, useMemo, useState } from 'react';

import { DataTable } from '@app/components/data-table';
import { PageContainer } from '@app/components/layout/PageContainer';
import { PageHeader } from '@app/components/layout/PageHeader';
import { Card } from '@app/components/ui/card';
import { EVAL_ROUTES } from '@app/constants/routes';
import { formatDataGridDate } from '@app/utils/date';
import { Link, useSearchParams } from 'react-router-dom';
import PromptDialog from './PromptDialog';
import type { ServerPromptWithMetadata } from '@promptfoo/types';
import type { ColumnDef } from '@tanstack/react-table';

interface PromptsProps {
  data: ServerPromptWithMetadata[];
  isLoading: boolean;
  error: string | null;
  showDatasetColumn?: boolean;
}

export default function Prompts({
  data,
  isLoading,
  error,
  showDatasetColumn = true,
}: PromptsProps) {
  const [searchParams] = useSearchParams();
  const [dialogState, setDialogState] = useState<{ open: boolean; selectedIndex: number }>({
    open: false,
    selectedIndex: 0,
  });

  // Reset dialog state when data changes to prevent invalid index
  useEffect(() => {
    if (dialogState.open && dialogState.selectedIndex >= data.length) {
      setDialogState({ open: false, selectedIndex: 0 });
    }
  }, [data, dialogState.open, dialogState.selectedIndex]);

  const handleClickOpen = (index: number) => {
    setDialogState({ open: true, selectedIndex: index });
  };

  const handleClose = () => {
    setDialogState((prev) => ({ ...prev, open: false }));
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    const promptId = searchParams.get('id');
    if (promptId && data.length > 0) {
      const promptIndex = data.findIndex((prompt) => prompt.id.startsWith(promptId));
      if (promptIndex !== -1) {
        handleClickOpen(promptIndex);
      }
    }
  }, [data, searchParams]);

  const columns: ColumnDef<ServerPromptWithMetadata>[] = useMemo(
    () => [
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ getValue }) => (
          <span className="font-mono text-sm">{getValue<string>().slice(0, 6)}</span>
        ),
        size: 100,
      },
      {
        accessorKey: 'label',
        header: 'Label',
        accessorFn: (row) => row.prompt.label || row.prompt.display || row.prompt.raw,
        cell: ({ getValue }) => <span className="text-sm">{getValue<string>()}</span>,
        size: 200,
      },
      {
        accessorKey: 'prompt',
        header: 'Prompt',
        accessorFn: (row) => row.prompt.raw,
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground line-clamp-2">{getValue<string>()}</span>
        ),
        size: 400,
      },
      {
        accessorKey: 'recentEvalDate',
        header: 'Most recent eval',
        cell: ({ getValue, row }) => {
          const value = getValue<string | null>();
          if (!value || !row.original.recentEvalId) {
            return <span className="text-sm text-muted-foreground">Unknown</span>;
          }
          return (
            <Link
              to={EVAL_ROUTES.DETAIL(row.original.recentEvalId)}
              className="text-primary hover:underline font-mono text-sm"
            >
              {formatDataGridDate(value)}
            </Link>
          );
        },
        size: 200,
      },
      {
        accessorKey: 'count',
        header: '# Evals',
        cell: ({ getValue }) => (
          <span className="font-mono tabular-nums">{getValue<number>()}</span>
        ),
        size: 120,
        meta: { align: 'right' },
      },
    ],
    [],
  );

  const handleRowClick = (prompt: ServerPromptWithMetadata) => {
    const index = data.findIndex((p) => p.id === prompt.id);
    if (index !== -1) {
      handleClickOpen(index);
    }
  };

  return (
    <PageContainer className="fixed top-14 left-0 right-0 bottom-0 flex flex-col overflow-hidden min-h-0">
      <PageHeader>
        <div className="container max-w-7xl mx-auto p-6">
          <h1 className="text-2xl font-semibold">Prompts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage and track all prompt templates and their evaluation history
          </p>
        </div>
      </PageHeader>
      <div className="flex-1 min-h-0 flex flex-col p-6">
        <div className="container max-w-7xl mx-auto flex-1 min-h-0 flex flex-col">
          <Card className="bg-white dark:bg-zinc-900 p-4 flex-1 min-h-0 flex flex-col">
            <DataTable
              columns={columns}
              data={data}
              isLoading={isLoading}
              error={error}
              onRowClick={handleRowClick}
              emptyMessage="Create a prompt to start evaluating your AI responses"
              initialSorting={[{ id: 'recentEvalDate', desc: true }]}
            />
          </Card>
        </div>
      </div>
      {dialogState.open &&
        dialogState.selectedIndex < data.length &&
        data[dialogState.selectedIndex] && (
          <PromptDialog
            openDialog={dialogState.open}
            handleClose={handleClose}
            selectedPrompt={data[dialogState.selectedIndex]}
            showDatasetColumn={showDatasetColumn}
          />
        )}
    </PageContainer>
  );
}
