import { PageContainer } from '@app/components/layout/PageContainer';
import { PageHeader } from '@app/components/layout/PageHeader';
import { Button } from '@app/components/ui/button';
import { REDTEAM_ROUTES } from '@app/constants/routes';
import { Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import ReportsTable from './ReportsTable';

export default function ReportIndex() {
  const navigate = useNavigate();

  return (
    <PageContainer className="fixed top-[calc(var(--nav-height)_+_var(--update-banner-height,0px))] left-0 right-0 bottom-0 overflow-y-auto">
      <PageHeader>
        <div className="mx-auto flex w-full max-w-screen-2xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Red Team Reports</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Review vulnerabilities found in your red team runs.
            </p>
          </div>
          <Button asChild size="sm">
            <Link to={REDTEAM_ROUTES.SETUP}>
              <Plus className="mr-2 size-4" />
              New red team
            </Link>
          </Button>
        </div>
      </PageHeader>
      <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-8">
        <ReportsTable
          onReportSelected={(evalId) => navigate(REDTEAM_ROUTES.REPORT_DETAIL(evalId))}
        />
      </div>
    </PageContainer>
  );
}
