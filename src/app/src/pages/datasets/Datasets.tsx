import { useEffect, useMemo, useRef, useState } from 'react';

import { DataTable } from '@app/components/data-table';
import { Card } from '@app/components/ui/card';
import { EVAL_ROUTES } from '@app/constants/routes';
import { formatDataGridDate } from '@app/utils/date';
import { Link, useSearchParams } from 'react-router-dom';
import DatasetDialog from './DatasetDialog';
import type { TestCase, TestCasesWithMetadata } from '@promptfoo/types';
import type { ColumnDef } from '@tanstack/react-table';

interface DatasetsProps {
  data: (TestCasesWithMetadata & { recentEvalDate: string })[];
  isLoading: boolean;
  error: string | null;
}

type DatasetRow = TestCasesWithMetadata & { recentEvalDate: string };

const getVariables = (testCases: DatasetRow['testCases']) => {
  if (!Array.isArray(testCases) || typeof testCases[0] === 'string') {
    return '';
  }
  const allVarsKeys = (testCases as TestCase[]).flatMap((testCase) =>
    Object.keys(testCase.vars || {}),
  );
  const uniqueVarsKeys = Array.from(new Set(allVarsKeys));
  return uniqueVarsKeys.length > 0 ? uniqueVarsKeys.join(', ') : 'None';
};

export default function Datasets({ data, isLoading, error }: DatasetsProps) {
  const [searchParams] = useSearchParams();
  const [dialogState, setDialogState] = useState<{ open: boolean; selectedIndex: number }>({
    open: false,
    selectedIndex: 0,
  });
  const hasShownPopup = useRef(false);

  const handleClickOpen = (index: number) => {
    setDialogState({ open: true, selectedIndex: index });
  };

  const handleClose = () => {
    setDialogState((prev) => ({ ...prev, open: false }));
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    if (hasShownPopup.current) {
      return;
    }

    const testCaseId = searchParams.get('id');
    if (testCaseId) {
      const index = data.findIndex((testCase) => testCase.id.startsWith(testCaseId));
      if (index !== -1) {
        handleClickOpen(index);
        hasShownPopup.current = true;
      }
    }
  }, [data, searchParams]);

  const columns: ColumnDef<DatasetRow>[] = useMemo(
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
        accessorKey: 'testCases',
        header: 'Test Cases',
        cell: ({ getValue }) => {
          const testCases = getValue<TestCase[]>();
          return <span className="text-sm">{Array.isArray(testCases) ? testCases.length : 0}</span>;
        },
        size: 120,
      },
      {
        id: 'variables',
        header: 'Variables',
        accessorFn: (row) => getVariables(row.testCases),
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground">{getValue<string>()}</span>
        ),
        size: 250,
      },
      {
        accessorKey: 'count',
        header: 'Total Evals',
        cell: ({ getValue }) => (
          <span className="font-mono tabular-nums">{getValue<number>() || 0}</span>
        ),
        size: 120,
        meta: { align: 'right' },
      },
      {
        id: 'numPrompts',
        header: 'Total Prompts',
        accessorFn: (row) => row.prompts?.length || 0,
        cell: ({ getValue }) => (
          <span className="font-mono tabular-nums">{getValue<number>()}</span>
        ),
        size: 140,
        meta: { align: 'right' },
      },
      {
        accessorKey: 'recentEvalDate',
        header: 'Latest Eval Date',
        cell: ({ getValue }) => {
          const value = getValue<string | null>();
          if (!value) {
            return <span className="text-sm text-muted-foreground">Unknown</span>;
          }
          return <span className="text-sm">{formatDataGridDate(value)}</span>;
        },
        size: 180,
      },
      {
        accessorKey: 'recentEvalId',
        header: 'Latest Eval ID',
        cell: ({ getValue }) => {
          const value = getValue<string | null>();
          if (!value) {
            return null;
          }
          return (
            <Link
              to={EVAL_ROUTES.DETAIL(value)}
              className="text-primary hover:underline font-mono text-sm"
            >
              {value}
            </Link>
          );
        },
        size: 150,
      },
    ],
    [],
  );

  const handleRowClick = (dataset: DatasetRow) => {
    const index = data.findIndex((d) => d.id === dataset.id);
    if (index !== -1) {
      handleClickOpen(index);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="border-b border-border bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm">
        <div className="container max-w-7xl mx-auto px-4 py-10">
          <h1 className="text-2xl font-bold tracking-tight">Datasets</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage test datasets and track their evaluation history
          </p>
        </div>
      </div>
      <div className="container max-w-7xl mx-auto px-4 py-8">
        <Card className="bg-white dark:bg-zinc-900 p-4">
          <DataTable
            columns={columns}
            data={data}
            isLoading={isLoading}
            error={error}
            onRowClick={handleRowClick}
            emptyMessage="Create a dataset to start evaluating your AI responses"
            initialSorting={[{ id: 'recentEvalDate', desc: true }]}
          />
        </Card>
      </div>
      {dialogState.open &&
        dialogState.selectedIndex < data.length &&
        data[dialogState.selectedIndex] && (
          <DatasetDialog
            openDialog={dialogState.open}
            handleClose={handleClose}
            testCase={data[dialogState.selectedIndex]}
          />
        )}
    </div>
  );
}
