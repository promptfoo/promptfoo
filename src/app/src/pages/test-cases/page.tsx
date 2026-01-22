import { useMemo, useState } from 'react';

import { PageContainer } from '@app/components/layout/PageContainer';
import { PageHeader } from '@app/components/layout/PageHeader';
import { Card } from '@app/components/ui/card';
import { usePageMeta } from '@app/hooks/usePageMeta';
import { useTestCases } from '@app/hooks/useTestCases';
import { TestCaseFilters } from './components/TestCaseFilters';
import { TestCaseList } from './components/TestCaseList';

/**
 * Container component for the Test Cases list page.
 * Handles data fetching and provides search/filter state.
 */
function TestCasesPageContent() {
  const [searchQuery, setSearchQuery] = useState('');
  const { testCases, loading, error } = useTestCases({ includeStats: true });

  // Client-side filtering by search query
  const filteredTestCases = useMemo(() => {
    if (!searchQuery.trim()) {
      return testCases;
    }

    const query = searchQuery.toLowerCase();
    return testCases.filter((tc) => {
      // Search in description
      if (tc.description?.toLowerCase().includes(query)) {
        return true;
      }

      // Search in variable values
      if (tc.vars) {
        const varsString = JSON.stringify(tc.vars).toLowerCase();
        if (varsString.includes(query)) {
          return true;
        }
      }

      // Search in ID
      if (tc.id.toLowerCase().includes(query)) {
        return true;
      }

      return false;
    });
  }, [testCases, searchQuery]);

  return (
    <PageContainer className="fixed top-14 left-0 right-0 bottom-0 flex flex-col overflow-hidden min-h-0">
      <PageHeader>
        <div className="container max-w-7xl mx-auto p-6">
          <h1 className="text-2xl font-semibold">Test Cases</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track test case performance across all evaluations
          </p>
        </div>
      </PageHeader>
      <div className="flex-1 min-h-0 flex flex-col p-6">
        <div className="container max-w-7xl mx-auto flex-1 min-h-0 flex flex-col gap-4">
          <TestCaseFilters searchQuery={searchQuery} onSearchChange={setSearchQuery} />
          <Card className="bg-white dark:bg-zinc-900 p-4 flex-1 min-h-0 flex flex-col">
            <TestCaseList testCases={filteredTestCases} isLoading={loading} error={error} />
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}

export default function TestCasesPage() {
  usePageMeta({
    title: 'Test Cases',
    description: 'Track test case performance across evaluations',
  });

  return <TestCasesPageContent />;
}
