import { PageContainer } from '@app/components/layout/PageContainer';
import { PageHeader } from '@app/components/layout/PageHeader';
import { Card } from '@app/components/ui/card';
import { EVAL_ROUTES } from '@app/constants/routes';
import { usePageMeta } from '@app/hooks/usePageMeta';
import { useNavigate } from 'react-router-dom';
import EvalsTable from './components/EvalsTable';

export default function EvalsIndexPage() {
  const navigate = useNavigate();

  usePageMeta({ title: 'Evals', description: 'Browse evaluation runs' });

  return (
    <PageContainer className="fixed top-14 left-0 right-0 bottom-0 flex flex-col overflow-hidden min-h-0">
      <PageHeader>
        <div className="container max-w-7xl mx-auto p-6">
          <h1 className="text-2xl font-semibold">Evaluations</h1>
          <p className="text-sm text-muted-foreground mt-1">View and manage your evaluation runs</p>
        </div>
      </PageHeader>
      <div className="flex-1 min-h-0 flex flex-col p-6">
        <div className="container max-w-7xl mx-auto flex-1 min-h-0 flex flex-col">
          <Card className="bg-white dark:bg-zinc-900 p-4 flex-1 min-h-0 flex flex-col">
            <EvalsTable
              onEvalSelected={(evalId) => navigate(EVAL_ROUTES.DETAIL(evalId))}
              showUtilityButtons
              deletionEnabled
            />
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
