import { PageContainer } from '@app/components/layout/PageContainer';
import { PageHeader } from '@app/components/layout/PageHeader';
import { Button } from '@app/components/ui/button';
import { EVAL_ROUTES, ROUTES } from '@app/constants/routes';
import { usePageMeta } from '@app/hooks/usePageMeta';
import { Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import EvalsTable from './components/EvalsTable';

export default function EvalsIndexPage() {
  const navigate = useNavigate();

  usePageMeta({ title: 'Evals', description: 'Browse evaluation runs' });

  return (
    <PageContainer className="fixed top-[calc(var(--nav-height)+var(--update-banner-height,0px))] left-0 right-0 bottom-0 flex flex-col overflow-hidden min-h-0">
      <PageHeader>
        <div className="mx-auto flex w-full max-w-screen-2xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Evaluations</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Compare runs and inspect model responses.
            </p>
          </div>
          <Button asChild size="sm">
            <Link to={ROUTES.SETUP}>
              <Plus className="mr-2 size-4" />
              New eval
            </Link>
          </Button>
        </div>
      </PageHeader>
      <div className="flex-1 min-h-0 flex flex-col p-4 sm:px-8 sm:py-6">
        <div className="mx-auto w-full max-w-screen-2xl flex-1 min-h-0 flex flex-col">
          <EvalsTable
            onEvalSelected={(evalId) => navigate(EVAL_ROUTES.DETAIL(evalId))}
            showUtilityButtons
            deletionEnabled
          />
        </div>
      </div>
    </PageContainer>
  );
}
