import { PageContainer } from '@app/components/layout/PageContainer';
import { PageHeader } from '@app/components/layout/PageHeader';
import { Card } from '@app/components/ui/card';
import { REDTEAM_ROUTES } from '@app/constants/routes';
import { useNavigate } from 'react-router-dom';
import ReportsTable from './ReportsTable';

export default function ReportIndex() {
  const navigate = useNavigate();

  return (
    <PageContainer className="fixed top-14 left-0 right-0 bottom-0 overflow-y-auto">
      <PageHeader>
        <div className="container max-w-7xl mx-auto p-6">
          <h1 className="text-2xl font-semibold">Red Team Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View and analyze your red team vulnerability scans
          </p>
        </div>
      </PageHeader>
      <div className="container max-w-7xl mx-auto px-6 pt-6 pb-12">
        <Card className="bg-white dark:bg-zinc-900 p-4">
          <ReportsTable
            onReportSelected={(evalId) => navigate(REDTEAM_ROUTES.REPORT_DETAIL(evalId))}
          />
        </Card>
      </div>
    </PageContainer>
  );
}
