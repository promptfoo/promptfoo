import { useEffect, useMemo, useRef, useState } from 'react';

import { DataTable } from '@app/components/data-table';
import { PageHeader } from '@app/components/layout/PageHeader';
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
        cell: ({ getValue }) => <span className="text-sm">{getValue<number>() || 0}</span>,
        size: 100,
      },
      {
        id: 'numPrompts',
        header: 'Total Prompts',
        accessorFn: (row) => row.prompts?.length || 0,
        cell: ({ getValue }) => <span className="text-sm">{getValue<number>()}</span>,
        size: 120,
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
              to={`/eval?evalId=${value}`}
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
    <div className="fixed top-14 left-0 right-0 bottom-0 bg-zinc-50 dark:bg-zinc-950 overflow-y-auto">
      <PageHeader>
        <div className="container max-w-7xl mx-auto px-6 py-6">
          <h1 className="text-2xl font-semibold">Datasets</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage test datasets and track their evaluation history
          </p>
        </div>
      </PageHeader>
      <div className="container max-w-7xl mx-auto px-6 py-6">
        <DataTable
          columns={columns}
          data={data}
          isLoading={isLoading}
          error={error}
          onRowClick={handleRowClick}
          emptyMessage="Create a dataset to start evaluating your AI responses"
          initialSorting={[{ id: 'recentEvalDate', desc: true }]}
        />
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
