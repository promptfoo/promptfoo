import { PageContainer } from '@app/components/layout/PageContainer';
import { PageHeader } from '@app/components/layout/PageHeader';
import { Card } from '@app/components/ui/card';
import { REDTEAM_ROUTES } from '@app/constants/routes';
import { useNavigate } from 'react-router-dom';
import ReportsTable from './ReportsTable';

export default function ReportIndex() {
  const navigate = useNavigate();

  return (
    <PageContainer className="fixed top-[calc(var(--nav-height)_+_var(--update-banner-height,0px))] left-0 right-0 bottom-0 flex min-h-0 flex-col overflow-x-hidden overflow-y-auto">
      <PageHeader>
        <div className="container max-w-7xl mx-auto p-6">
          <h1 className="text-2xl font-bold tracking-tight">Red Team Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View and analyze your red team vulnerability scans
          </p>
        </div>
      </PageHeader>
      <div className="flex-1 min-h-0 flex flex-col p-6">
        <div className="container max-w-7xl mx-auto flex-1 min-h-0 flex flex-col">
          <Card className="bg-white dark:bg-zinc-900 p-4 flex-1 min-h-0 flex flex-col">
            <ReportsTable
              onReportSelected={(evalId) => navigate(REDTEAM_ROUTES.REPORT_DETAIL(evalId))}
            />
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
